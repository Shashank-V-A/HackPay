import React, { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import SharedHeader from './components/SharedHeader'
import Icon from './components/Icon'
import HackathonGlobe from '@/components/ui/usage'
import EventVerifiedBadge from './components/EventVerifiedBadge'
import { getHackathonsFromStorage } from './holder/utils/roleDetection'
import { subscribeHackathonsDatasetChanged } from './utils/hackathonSync'
import { enrichHackathonLocation } from './utils/hackathonGlobe'
import { enrichHackathonFunding } from './utils/format'
import { fetchHackathons } from './services/hackathonApi'
import { INR_VAULT_ID } from './constants/escrow'
import {
  STATUS_META,
  deriveStatus,
  eventCover,
  formatDateRange,
  formatRelative,
  formatXlm,
  participantCount,
  prizeCurrency,
  prizeTotal,
} from './utils/format'
import './styles/index.css'

gsap.registerPlugin(useGSAP)

const TRUST_MARKS = ['Razorpay INR', 'UPI / IMPS', 'Amazon Cognito', 'Dual-control vault', '2-of-2 approval']

const VALUE_TILES = [
  {
    tone: 'blush',
    icon: 'lock',
    title: 'Lock the prize before judging starts.',
    text: 'Sponsors fund an INR vault up front. Organizers never front cash, and nobody can pull the money back mid-event.',
  },
  {
    tone: 'gold',
    icon: 'users',
    title: 'Neither side can move funds alone.',
    text: 'Release takes two approvals. The sponsor cannot claw it back. The organizer cannot divert it. Both sides, or nothing.',
  },
  {
    tone: 'lilac',
    icon: 'send',
    title: 'Winners get paid in real rupees.',
    text: 'After dual approval, payment and git gates run, then Razorpay sends UPI or bank payouts with an auditable receipt.',
  },
]

const FEATURES = [
  {
    icon: 'lock',
    title: 'Neither side can move funds alone',
    text: 'A dual-control INR vault means the sponsor cannot claw prize money back and the organizer cannot divert it. Both approvals or nothing.',
  },
  {
    icon: 'send',
    title: 'Payouts are gated by agents',
    text: 'Payment and git evaluators must pass before Razorpay payouts fire. There is no silent partial release.',
  },
  {
    icon: 'shield',
    title: 'Auditable receipts',
    text: 'Every fund and payout writes a Razorpay receipt id plus an immutable app log, so finance gets evidence without a blockchain.',
  },
  {
    icon: 'clock',
    title: 'No cash fronting',
    text: 'Organizers never wire their own money or chase a sponsor after the event. The prize is already locked before judging starts.',
  },
]

const ROLES = [
  {
    tone: 'blush',
    title: 'For sponsors',
    href: '/verifier',
    cta: 'Open sponsor console',
    points: [
      'Fund a prize pool into escrow',
      'Review winners before releasing',
      'Co-approve the payout transaction',
    ],
  },
  {
    tone: 'gold',
    title: 'For organizers',
    href: '/organizer',
    cta: 'Open organizer console',
    points: [
      'Create events and prize tiers',
      'Manage participants and winners',
      'Propose and execute payouts',
    ],
  },
  {
    tone: 'lilac',
    title: 'For participants',
    href: '/holder',
    cta: 'Open participant portal',
    points: [
      'Register for open hackathons',
      'Track prize and payout status',
      'Receive winnings in INR',
    ],
  },
]

/**
 * Only scroll for fragments that are valid CSS identifiers. Marketing and
 * analytics tools append things like `#~utm`, and querySelector throws a
 * SyntaxError on those.
 */
function scrollToHash(hash) {
  if (!hash || hash.length < 2) return
  if (!/^#[A-Za-z][\w-]*$/.test(hash)) return
  const element = document.getElementById(hash.slice(1))
  if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function EventCard({ hackathon }) {
  const status = deriveStatus(hackathon)
  const meta = STATUS_META[status]
  const cover = eventCover(hackathon.name)
  const people = participantCount(hackathon)
  const total = prizeTotal(hackathon)

  return (
    <article id={`event-${hackathon.id}`} className="pv-event">
      <div className="pv-event__cover" style={{ background: cover.background }}>
        <span className="pv-event__cover-initials">{cover.initials}</span>
        <span className={`pv-badge ${meta.badge} pv-event__cover-badge`.trim()}>
          {status === 'live' ? <span className="pv-badge__dot pv-badge__dot--pulse" /> : null}
          {meta.label}
        </span>
        <EventVerifiedBadge hackathon={hackathon} />
      </div>
      <div className="pv-event__body">
        <span className="pv-event__date">
          <Icon name="calendar" size={13} />
          {formatDateRange(hackathon.startDate, hackathon.endDate)}
          {status === 'upcoming' && hackathon.startDate ? (
            <span className="pv-dim">· {formatRelative(hackathon.startDate)}</span>
          ) : null}
        </span>
        <h3 className="pv-event__title">{hackathon.name || 'Untitled event'}</h3>
        {hackathon.description ? (
          <p className="pv-event__desc">{hackathon.description}</p>
        ) : null}
        <div className="pv-event__meta">
          <span className="pv-event__meta-item">
            <Icon name="trophy" size={13} />
            <span className="pv-event__prize">
              {formatXlm(total)} {prizeCurrency(hackathon)}
            </span>
          </span>
          <span className="pv-event__meta-item">
            <Icon name="users" size={13} />
            {people} registered
          </span>
        </div>
      </div>
      <a
        className="pv-event__stretched-link"
        href={`/holder?event=${encodeURIComponent(hackathon.id)}`}
        aria-label={`View ${hackathon.name || 'event'}`}
      />
    </article>
  )
}

function Landing() {
  const rootRef = useRef(null)
  const [hackathons, setHackathons] = useState(() =>
    getHackathonsFromStorage().map((h) => enrichHackathonFunding(enrichHackathonLocation(h))),
  )

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.pv-hero__copy > *', {
          y: 28,
          autoAlpha: 0,
          duration: 0.75,
          stagger: 0.1,
          ease: 'power3.out',
        })
        gsap.from('.pv-tile', {
          y: 36,
          autoAlpha: 0,
          duration: 0.65,
          stagger: 0.12,
          delay: 0.15,
          ease: 'power3.out',
        })
      })
      return () => mm.revert()
    },
    { scope: rootRef },
  )

  useEffect(() => {
    if (window.location.hash) {
      scrollToHash(window.location.hash)
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
    const onHashChange = () => scrollToHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(
    () =>
      subscribeHackathonsDatasetChanged(() =>
        setHackathons(
          getHackathonsFromStorage().map((h) => enrichHackathonFunding(enrichHackathonLocation(h))),
        ),
      ),
    [],
  )

  useEffect(() => {
    const refresh = () => {
      fetchHackathons()
        .then((list) => {
          if (Array.isArray(list)) {
            setHackathons(list.map((h) => enrichHackathonFunding(enrichHackathonLocation(h))))
          }
        })
        .catch(() => {})
    }

    refresh()

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const { openEvents, stats } = useMemo(() => {
    const withStatus = hackathons.map((h) => ({ ...h, _status: deriveStatus(h) }))
    const open = withStatus
      .filter((h) => h._status !== 'completed')
      .sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0))
    return {
      openEvents: open,
      stats: {
        events: hackathons.length,
        locked: hackathons.reduce((sum, h) => sum + prizeTotal(h), 0),
        participants: hackathons.reduce((sum, h) => sum + participantCount(h), 0),
      },
    }
  }, [hackathons])

  return (
    <div className="pv-shell" ref={rootRef}>
      <a className="pv-skip-link" href="#main">
        Skip to content
      </a>

      <SharedHeader activeTab="landing" />

      <main id="main">
        <section className="pv-container">
          <div className="pv-hero pv-hero--splash">
            <div className="pv-hero__copy">
              <h1 className="pv-hero__title">Prize money nobody can move alone.</h1>
              <p className="pv-hero__lede">
                HackPay is where sponsors lock INR, organizers run the event, and winners get paid
                — only after both sides approve.
              </p>
              <div className="pv-hero__cta">
                <a href="/holder" className="pv-btn pv-btn--primary pv-btn--lg">
                  Get started
                </a>
                <a href="#how" className="pv-hero__textlink">
                  See how escrow works
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="pv-logos" aria-label="Settlement rails">
          <div className="pv-logos__track">
            {[...TRUST_MARKS, ...TRUST_MARKS].map((mark, index) => (
              <span className="pv-logos__item" key={`${mark}-${index}`}>
                {mark}
              </span>
            ))}
          </div>
        </section>

        <section className="pv-container" id="how">
          <div className="pv-tiles">
            {VALUE_TILES.map((tile) => (
              <article className={`pv-tile pv-tile--${tile.tone}`} key={tile.title}>
                <span className="pv-tile__icon" aria-hidden>
                  <Icon name={tile.icon} size={28} />
                </span>
                <h2 className="pv-tile__title">{tile.title}</h2>
                <p className="pv-tile__text">{tile.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="pv-band" id="events">
          <div className="pv-container">
            <div className="pv-section__header">
              <div>
                <h2 className="pv-section-head__title">Open events</h2>
                <p className="pv-section__desc">
                  Hackathons currently accepting registrations or in progress.
                </p>
              </div>
              <div className="pv-btn-group">
                <a href="/past-events" className="pv-btn pv-btn--ghost pv-btn--sm">
                  Past events
                </a>
                <a href="/holder" className="pv-btn pv-btn--primary pv-btn--sm">
                  Browse all events
                  <Icon name="arrowRight" size={14} />
                </a>
              </div>
            </div>

            {openEvents.length > 0 ? (
              <div className="pv-events">
                {openEvents.map((h) => (
                  <EventCard key={h.id} hackathon={h} />
                ))}
              </div>
            ) : (
              <div className="pv-card pv-card--flat">
                <div className="pv-empty">
                  <span className="pv-empty__icon">
                    <Icon name="calendar" size={20} />
                  </span>
                  <h3 className="pv-empty__title">No open events yet</h3>
                  <p className="pv-empty__text">
                    When an organizer publishes a hackathon and a sponsor locks its prize pool, it
                    appears here for participants to register.
                  </p>
                  <a href="/organizer" className="pv-btn pv-btn--primary pv-btn--sm">
                    <Icon name="plus" size={14} />
                    Create an event
                  </a>
                </div>
              </div>
            )}

            {openEvents.length > 0 ? (
              <div className="pv-hero__globe pv-hero__globe--band">
                <HackathonGlobe hackathons={openEvents} />
              </div>
            ) : null}
          </div>
        </section>

        <section className="pv-band pv-band--surface">
          <div className="pv-container">
            <div className="pv-section-head">
              <h2 className="pv-section-head__title">Why escrow, not trust</h2>
              <p className="pv-section-head__text">
                Hackathon prizes fail in predictable ways. Each of these removes one of them.
              </p>
            </div>
            <div className="pv-features">
              {FEATURES.map((f) => (
                <div className="pv-feature" key={f.title}>
                  <span className="pv-feature__icon">
                    <Icon name={f.icon} size={18} />
                  </span>
                  <h3 className="pv-feature__title">{f.title}</h3>
                  <p className="pv-feature__text">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pv-band" id="roles">
          <div className="pv-container">
            <div className="pv-section-head">
              <h2 className="pv-section-head__title">Pick your side of the table</h2>
              <p className="pv-section-head__text">
                Three consoles, one shared escrow. Each role only sees what it controls.
              </p>
            </div>
            <div className="pv-roles">
              {ROLES.map((role) => (
                <div className={`pv-role pv-role--${role.tone}`} key={role.title}>
                  <h3 className="pv-role__title">{role.title}</h3>
                  <ul className="pv-role__list">
                    {role.points.map((p) => (
                      <li key={p}>
                        <span className="pv-role__tick">
                          <Icon name="check" size={14} />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                  <a href={role.href} className="pv-btn pv-btn--primary pv-btn--block">
                    {role.cta}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="pv-container">
          <div className="pv-caveat">
            <span className="pv-caveat__icon">
              <Icon name="alert" size={18} />
            </span>
            <div>
              <h3 className="pv-caveat__title">What this does not solve yet</h3>
              <p className="pv-caveat__text">
                If either sponsor or organizer refuses to sign, funds stay in escrow. There is no
                timeout or automatic refund rule.
              </p>
              <p className="pv-caveat__text">
                Only INR prize pools are supported. Gift cards and swag remain out of scope.
              </p>
            </div>
          </div>

          <div className="pv-cta">
            <h2 className="pv-cta__title">Run your next hackathon without the payout argument.</h2>
            <p className="pv-cta__text">
              Lock the prize pool once. Let dual approval and agents decide who gets paid.
            </p>
            <div className="pv-btn-group">
              <a href="/organizer" className="pv-btn pv-btn--primary pv-btn--lg">
                Create an event
              </a>
              <a href="/holder" className="pv-btn pv-btn--ghost pv-btn--lg">
                Open participant portal
              </a>
            </div>
            <p className="pv-cta__proof">
              {stats.events} {stats.events === 1 ? 'event' : 'events'} · {formatXlm(stats.locked)}{' '}
              INR locked · vault {INR_VAULT_ID}
            </p>
          </div>
        </section>
      </main>

      <footer className="pv-footer">
        <div className="pv-footer__inner">
          <span className="pv-brand__word">hackpay</span>
          <ul className="pv-footer__links">
            <li>
              <a href="/holder">Participant portal</a>
            </li>
            <li>
              <a href="/past-events">Past events</a>
            </li>
            <li>
              <a href="/organizer">Organizer</a>
            </li>
            <li>
              <a href="/verifier">Sponsor</a>
            </li>
            <li>
              <a href="https://razorpay.com/" target="_blank" rel="noreferrer">
                Razorpay
                <Icon name="external" size={12} />
              </a>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  )
}

export default Landing
export { Landing }
