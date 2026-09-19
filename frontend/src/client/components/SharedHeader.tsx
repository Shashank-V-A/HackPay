import { useState } from 'react'
import Icon from './Icon'
import LandingNavigationMenu, { itemClass, NavGlyph } from './LandingNavigationMenu'
import { truncateAddress } from './AddressChip'
import {
  AppRole,
  clearActiveSession,
  getActiveSession,
  requireManualConnect,
} from '../utils/authSession'
import { disconnectWallet } from '../wallet'

interface Tab {
  id: string
  label: string
  href: string
}

const ALL_TABS: Tab[] = [
  { id: 'holder', label: 'Escrow Wallet', href: '/holder' },
  { id: 'recruiter', label: 'Sponsor', href: '/verifier' },
  { id: 'issuer', label: 'Organizer', href: '/issuer' },
]

const ROLE_TAB: Record<AppRole, string> = {
  participant: 'holder',
  sponsor: 'recruiter',
  organizer: 'issuer',
}

const ROLE_LABEL: Record<AppRole, string> = {
  participant: 'Participant',
  sponsor: 'Sponsor',
  organizer: 'Organizer',
}

interface Session {
  wallet: string
  role: AppRole
}

/**
 * Which portal links to show. Behaviour is unchanged from the original header:
 * the landing and holder pages only ever advertise the wallet; once a session
 * exists we show just that role's portal; with no session we show all three.
 */
function visibleTabs(activeTab: string, session: Session | null): Tab[] {
  if (activeTab === 'landing' || activeTab === 'holder') {
    return ALL_TABS.filter((tab) => tab.id === 'holder')
  }
  if (session) {
    const allowed = ROLE_TAB[session.role]
    return ALL_TABS.filter((tab) => tab.id === allowed)
  }
  return ALL_TABS
}

export interface SharedHeaderProps {
  activeTab?: string
  /** Small label after the wordmark, e.g. "Organizer". */
  subtitle?: string
  navLinks?: { label: string; href: string }[]
  showSession?: boolean
}

export default function SharedHeader({
  activeTab = 'landing',
  subtitle,
  navLinks = [],
  showSession = true,
}: SharedHeaderProps) {
  const [navOpen, setNavOpen] = useState(false)
  const session = showSession ? getActiveSession() : null
  const subtitleLabel = subtitle?.trim().toLowerCase()
  const tabs = visibleTabs(activeTab, session).filter(
    (tab) => !subtitleLabel || tab.label.toLowerCase() !== subtitleLabel,
  )

  const handleDisconnect = () => {
    void disconnectWallet()
    clearActiveSession()
    requireManualConnect()
    window.location.href = '/'
  }

  return (
    <header className={activeTab === 'landing' ? 'pv-topbar pv-topbar--lamp' : 'pv-topbar'}>
      <div className="pv-topbar__inner">
        <a href="/" className="pv-brand">
          <span className="pv-brand__mark" aria-hidden>
            <Icon name="lock" size={14} />
          </span>
          <span>HackPay</span>
          {subtitle ? <span className="pv-brand__sub">{subtitle}</span> : null}
        </a>

        <nav
          className={`pv-topbar__nav ${navOpen ? 'is-open' : ''}`.trim()}
          aria-label="Primary"
          onClick={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('a, button')) setNavOpen(false)
          }}
        >
          {activeTab === 'landing' ? (
            <LandingNavigationMenu
              renderTools={({ active, setActive }) =>
                session ? (
                  <a
                    href={
                      ALL_TABS.find((tab) => tab.id === ROLE_TAB[session.role])?.href ?? '/holder'
                    }
                    className={itemClass(active === 4)}
                    title={session.wallet}
                    onMouseEnter={() => setActive(4)}
                    onFocus={() => setActive(4)}
                  >
                    <NavGlyph icon="wallet" label={ROLE_LABEL[session.role] || 'Wallet'} />
                  </a>
                ) : (
                  <a
                    href="/holder"
                    className={itemClass(active === 4)}
                    onMouseEnter={() => setActive(4)}
                    onFocus={() => setActive(4)}
                  >
                    <NavGlyph icon="wallet" label="Connect wallet" />
                  </a>
                )
              }
            />
          ) : (
            <>
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className="pv-navlink">
                  {link.label}
                </a>
              ))}
              {tabs.map((tab) => (
                <a
                  key={tab.id}
                  href={tab.href}
                  className={`pv-navlink ${activeTab === tab.id ? 'is-active' : ''}`.trim()}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  {tab.label}
                </a>
              ))}
            </>
          )}
        </nav>

        <div className="pv-topbar__actions">
          {activeTab !== 'landing' ? (
            <>
              {session ? (
                <>
                  <span className="pv-session" title={session.wallet}>
                    <span className="pv-avatar pv-avatar--sm" aria-hidden>
                      {(ROLE_LABEL[session.role] || '?').charAt(0)}
                    </span>
                    <span className="pv-session__text">
                      <span className="pv-session__role">
                        {ROLE_LABEL[session.role] || session.role}
                      </span>
                      <span className="pv-session__addr">{truncateAddress(session.wallet, 4, 4)}</span>
                    </span>
                  </span>
                  <button
                    type="button"
                    className="pv-btn pv-btn--secondary pv-btn--sm"
                    onClick={handleDisconnect}
                  >
                    <Icon name="logout" size={14} />
                    Sign out
                  </button>
                </>
              ) : (
                <a href="/holder" className="pv-btn pv-btn--primary pv-btn--sm">
                  Connect wallet
                </a>
              )}
            </>
          ) : session ? (
            <button
              type="button"
              className="pv-btn pv-btn--secondary pv-btn--sm"
              onClick={handleDisconnect}
            >
              <Icon name="logout" size={14} />
              Sign out
            </button>
          ) : null}

          <button
            type="button"
            className="pv-navtoggle"
            onClick={() => setNavOpen((open) => !open)}
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
          >
            <Icon name={navOpen ? 'x' : 'menu'} />
          </button>
        </div>
      </div>
    </header>
  )
}
