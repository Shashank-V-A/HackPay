import { useMemo, useState, useEffect, useCallback } from 'react'
import Icon from '../../components/Icon'
import EventVerifiedBadge from '../../components/EventVerifiedBadge'
import { Hackathon } from '../../types/hackathon'
import { useHackathons, usePayoutProposals } from '../../hooks/useHackathons'
import { celebrateWinnerOnce } from '../../hooks/useWinnerCelebration'
import { isRegistered, registerForHackathon } from '../utils/registration'
import { useEscrow } from '../../hooks/useEscrow'
import { isValidUpiVpa } from '../../constants/escrow'
import { findWinnerForAccount } from '../../utils/winnerMatch'
import { getPayoutWorkflowStage, isPayoutReleased } from '../../utils/payoutWorkflow'
import {
  STATUS_META,
  deriveStatus,
  eventCover,
  formatDateRange,
  formatXlm,
  participantCount,
  payoutReceiptUrl,
  payoutStatusCopy,
  prizeCurrency,
  prizeTotal,
} from '../../utils/format'
import {
  fetchMySubmissions,
  saveRepoSubmission,
  type RepoSubmission,
} from '../../services/submissionApi'
import SubmissionAssessmentReport from './SubmissionAssessmentReport'

interface ParticipantDashboardProps {
  userWallet: string | null
  onNavigate?: (view: string, params?: Record<string, unknown>) => void
}

export default function ParticipantDashboard({
  userWallet,
  onNavigate,
}: ParticipantDashboardProps) {
  const { hackathons, reload } = useHackathons()
  const { proposals } = usePayoutProposals()
  const { claimPrize } = useEscrow()
  const [registeringId, setRegisteringId] = useState<string | null>(null)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [submissions, setSubmissions] = useState<RepoSubmission[]>([])
  const [submitHackathonId, setSubmitHackathonId] = useState<string>('')
  const [idea, setIdea] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [savingSubmission, setSavingSubmission] = useState(false)
  const [reportSubmission, setReportSubmission] = useState<RepoSubmission | null>(null)

  const loadSubmissions = useCallback(async () => {
    if (!userWallet) return
    const result = await fetchMySubmissions(userWallet)
    if (result.success) setSubmissions(result.submissions || [])
  }, [userWallet])

  useEffect(() => {
    void loadSubmissions()
  }, [loadSubmissions])

  const submissionByHackathon = useMemo(() => {
    const map = new Map<string, RepoSubmission>()
    for (const s of submissions) map.set(s.hackathonId, s)
    return map
  }, [submissions])

  const mine = useMemo(
    () => hackathons.filter((h) => isRegistered(h, userWallet)),
    [hackathons, userWallet],
  )

  const available = useMemo(
    () =>
      hackathons.filter(
        (h) => deriveStatus(h) !== 'completed' && !isRegistered(h, userWallet),
      ),
    [hackathons, userWallet],
  )

  const myWinnings = useMemo(() => {
    if (!userWallet) return []
    return mine
      .map((h) => ({
        hackathon: h,
        win: findWinnerForAccount(h, userWallet),
      }))
      .filter((x) => x.win)
  }, [mine, userWallet])

  const totalWon = myWinnings.reduce((sum, x) => sum + (Number(x.win?.prizeAmount) || 0), 0)

  useEffect(() => {
    if (!userWallet) return
    for (const { hackathon } of myWinnings) {
      celebrateWinnerOnce(`participant_${hackathon.id}_${userWallet}`)
    }
  }, [myWinnings, userWallet])

  const handleRegister = async (hackathon: Hackathon) => {
    setRegisteringId(hackathon.id)
    setNotice(null)
    const result = await registerForHackathon(hackathon.id, userWallet)
    if (result.ok) {
      setNotice({ tone: 'success', text: `Registered for ${hackathon.name}.` })
      reload()
    } else {
      setNotice({ tone: 'danger', text: result.reason })
    }
    setRegisteringId(null)
  }

  const handleReceive = async (hackathon: Hackathon, amount: number) => {
    if (!userWallet) return
    const destination = (destinations[hackathon.id] || '').trim()
    if (!isValidUpiVpa(destination) && !/^\d{9,18}$/.test(destination)) {
      setNotice({
        tone: 'danger',
        text: 'Enter a UPI ID (name@okaxis) or bank account number. Checkout is only for sponsors.',
      })
      return
    }
    setClaimingId(hackathon.id)
    setNotice(null)
    const result = await claimPrize({
      hackathonId: hackathon.id,
      destination,
      amount,
    })
    if (result.success) {
      try {
        localStorage.setItem(`pv_prize_claim_${hackathon.id}_${userWallet.toLowerCase()}`, result.txHash)
      } catch {
        /* ignore */
      }
      const href = payoutReceiptUrl(result.txHash)
      setNotice({
        tone: 'success',
        text: result.txHash.startsWith('pout_queued')
          ? `Payout queued (${result.txHash}). RazorpayX Current Account is needed for a live bank credit.`
          : `Payout submitted (${result.txHash}).`,
      })
      if (href.startsWith('http')) {
        window.open(href, '_blank', 'noopener,noreferrer')
      }
    } else {
      setNotice({ tone: 'danger', text: result.error || 'Could not send payout.' })
    }
    setClaimingId(null)
  }

  const openSubmitForm = (hackathon: Hackathon) => {
    const existing = submissionByHackathon.get(hackathon.id)
    setSubmitHackathonId(hackathon.id)
    setIdea(existing?.idea || '')
    setGithubUrl(existing?.githubUrl || '')
    setReportSubmission(null)
  }

  const handleSaveSubmission = async () => {
    if (!userWallet || !submitHackathonId) return
    setSavingSubmission(true)
    setNotice(null)
    const result = await saveRepoSubmission({
      wallet: userWallet,
      hackathonId: submitHackathonId,
      idea,
      githubUrl,
    })
    setSavingSubmission(false)
    if (!result.success || !result.submission) {
      setNotice({ tone: 'danger', text: result.error || 'Could not save submission.' })
      return
    }
    setSubmissions((prev) => {
      const rest = prev.filter((s) => s.hackathonId !== result.submission!.hackathonId)
      return [result.submission!, ...rest]
    })
    setNotice({
      tone: 'success',
      text: 'Submission saved. Nasiko git-eval (Anakin surfs the repo) will produce the assessment when configured.',
    })
    reload()
  }

  if (!userWallet) {
    return (
      <div className="pv-alert pv-alert--warning">
        <span className="pv-alert__icon">
          <Icon name="alert" size={16} />
        </span>
        <div className="pv-alert__content">
          <p className="pv-alert__text">
            Connect your account to see your registrations and prizes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pv-stack pv-stack--lg">
      {notice ? (
        <div className={`pv-alert pv-alert--${notice.tone}`} role="status" aria-live="polite">
          <span className="pv-alert__icon">
            <Icon name={notice.tone === 'success' ? 'checkCircle' : 'alert'} size={16} />
          </span>
          <div className="pv-alert__content">
            <p className="pv-alert__text">{notice.text}</p>
          </div>
          <button
            type="button"
            className="pv-btn pv-btn--ghost pv-btn--xs pv-btn--icon"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ) : null}

      {reportSubmission ? (
        <SubmissionAssessmentReport
          submission={reportSubmission}
          onBack={() => setReportSubmission(null)}
        />
      ) : null}

      {!reportSubmission ? (
      <>
      <div className="pv-stats">
        <div className="pv-stat">
          <span className="pv-stat__label">
            <Icon name="calendar" size={12} />
            Registered
          </span>
          <span className="pv-stat__value">{mine.length}</span>
        </div>
        <div className="pv-stat">
          <span className="pv-stat__label">
            <Icon name="trophy" size={12} />
            Prizes won
          </span>
          <span className="pv-stat__value">{myWinnings.length}</span>
        </div>
        <div className="pv-stat">
          <span className="pv-stat__label">
            <Icon name="wallet" size={12} />
            Total winnings
          </span>
          <span className="pv-stat__value">
            {formatXlm(totalWon)}
            <span className="pv-stat__unit">INR</span>
          </span>
        </div>
      </div>

      {myWinnings.length > 0 ? (
        <section className="pv-card">
          <div className="pv-card__header">
            <div>
              <h3 className="pv-card__title">Receive prize</h3>
              <p className="pv-card__subtitle">
                Sponsors pay the vault with Razorpay Checkout. You receive INR on UPI or IMPS —
                you do not pay at Checkout.
              </p>
            </div>
          </div>
          <div className="pv-card__body">
            <div className="pv-stack">
              {myWinnings.map(({ hackathon: h, win }) => {
                const stage = getPayoutWorkflowStage(h, proposals)
                const released = isPayoutReleased(h, proposals)
                let savedReceipt = ''
                try {
                  savedReceipt =
                    localStorage.getItem(`pv_prize_claim_${h.id}_${userWallet.toLowerCase()}`) || ''
                } catch {
                  savedReceipt = ''
                }
                const defaultDest = isValidUpiVpa(win?.payoutAddress || '')
                  ? String(win?.payoutAddress)
                  : ''
                const dest = destinations[h.id] ?? defaultDest
                const canClaim = Boolean(win) && stage === 'ready_to_release' && !released && !savedReceipt
                return (
                  <div key={h.id} className="pv-dl" style={{ marginBottom: 'var(--pv-space-6)' }}>
                    <div className="pv-dl__item">
                      <dt className="pv-dl__key">{h.name}</dt>
                      <dd className="pv-dl__val">
                        ₹{formatXlm(win?.prizeAmount)} · {win?.prizeTier || 'Winner'}
                      </dd>
                    </div>
                    {released || savedReceipt ? (
                      <p className="pv-muted" style={{ fontSize: 'var(--pv-text-sm)' }}>
                        {savedReceipt || h.payoutTxHash
                          ? payoutStatusCopy(savedReceipt || h.payoutTxHash)
                          : 'Payout marked released. This is a receive transfer, not Checkout.'}
                      </p>
                    ) : canClaim ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          void handleReceive(h, Number(win?.prizeAmount) || 0)
                        }}
                      >
                        <div className="pv-field">
                          <label className="pv-field__label" htmlFor={`claim-dest-${h.id}`}>
                            UPI or bank account
                          </label>
                          <input
                            id={`claim-dest-${h.id}`}
                            className="pv-input"
                            placeholder="name@okaxis"
                            value={dest}
                            onChange={(e) =>
                              setDestinations((prev) => ({ ...prev, [h.id]: e.target.value }))
                            }
                            disabled={claimingId === h.id}
                          />
                        </div>
                        <button
                          type="submit"
                          className="pv-btn pv-btn--primary"
                          style={{ marginTop: 'var(--pv-space-4)' }}
                          disabled={claimingId === h.id}
                        >
                          {claimingId === h.id ? (
                            <>
                              <span className="pv-btn__spinner" />
                              Sending payout
                            </>
                          ) : (
                            <>
                              <Icon name="wallet" size={15} />
                              Receive ₹{formatXlm(win?.prizeAmount)}
                            </>
                          )}
                        </button>
                      </form>
                    ) : (
                      <p className="pv-muted" style={{ fontSize: 'var(--pv-text-sm)' }}>
                        {stage === 'awaiting_sponsor'
                          ? 'Waiting for the sponsor to co-approve the payout.'
                          : stage === 'winners_selected'
                            ? 'Waiting for the organizer to propose the payout.'
                            : 'Payout is not ready yet. Dual approval must complete first.'}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      {mine.length > 0 ? (
        <section className="pv-card">
          <div className="pv-card__header">
            <div>
              <h3 className="pv-card__title">Submit GitHub project</h3>
              <p className="pv-card__subtitle">
                Attach your public repo and idea. Saved to DynamoDB (and Supabase if configured).
                The Nasiko git-eval agent uses Anakin to surf the GitHub link and write the report.
              </p>
            </div>
          </div>
          <div className="pv-card__body">
            <form
              className="pv-submit-form"
              onSubmit={(e) => {
                e.preventDefault()
                void handleSaveSubmission()
              }}
            >
              <div className="pv-field">
                <label className="pv-field__label" htmlFor="submit-hackathon">
                  Hackathon
                </label>
                <select
                  id="submit-hackathon"
                  className="pv-input"
                  value={submitHackathonId}
                  onChange={(e) => {
                    const id = e.target.value
                    const h = mine.find((x) => x.id === id)
                    if (h) openSubmitForm(h)
                    else setSubmitHackathonId(id)
                  }}
                  required
                >
                  <option value="">Select a registered event</option>
                  {mine.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {submissionByHackathon.has(h.id) ? ' · submitted' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pv-submit-form__row">
                <div className="pv-field">
                  <label className="pv-field__label" htmlFor="submit-idea">
                    Idea / problem statement
                  </label>
                  <textarea
                    id="submit-idea"
                    className="pv-input"
                    rows={4}
                    placeholder="What are you building and why?"
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    required
                    disabled={!submitHackathonId || savingSubmission}
                  />
                </div>
                <div className="pv-field">
                  <label className="pv-field__label" htmlFor="submit-github">
                    Public GitHub repo
                  </label>
                  <input
                    id="submit-github"
                    className="pv-input"
                    placeholder="https://github.com/owner/repo"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    required
                    disabled={!submitHackathonId || savingSubmission}
                  />
                  <p className="pv-muted" style={{ fontSize: 'var(--pv-text-xs)', marginTop: 8 }}>
                    Must be public so the evaluator can read metadata and README.
                  </p>
                </div>
              </div>
              <div className="pv-btn-group">
                <button
                  type="submit"
                  className="pv-btn pv-btn--primary"
                  disabled={!submitHackathonId || savingSubmission}
                >
                  {savingSubmission ? (
                    <>
                      <span className="pv-btn__spinner" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Icon name="checkCircle" size={15} />
                      Save submission
                    </>
                  )}
                </button>
              </div>
            </form>

            {submissions.length > 0 ? (
              <div className="pv-stack" style={{ marginTop: 'var(--pv-space-6)' }}>
                <h4 className="pv-card__subtitle" style={{ margin: 0 }}>
                  Your submissions
                </h4>
                {submissions.map((s) => (
                  <div key={s.id} className="pv-dl">
                    <div className="pv-dl__item">
                      <dt className="pv-dl__key">{s.hackathonName || s.hackathonId}</dt>
                      <dd className="pv-dl__val">
                        <a href={s.githubUrl} target="_blank" rel="noopener noreferrer">
                          {s.githubUrl.replace(/^https?:\/\//, '')}
                        </a>
                        {s.assessment ? (
                          <span className="pv-badge pv-badge--success" style={{ marginLeft: 8 }}>
                            {s.assessment.scores.overall}% overall
                          </span>
                        ) : (
                          <span className="pv-badge" style={{ marginLeft: 8 }}>
                            pending report
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="pv-btn-group">
                      {s.assessment ? (
                        <button
                          type="button"
                          className="pv-btn pv-btn--secondary pv-btn--xs"
                          onClick={() => setReportSubmission(s)}
                        >
                          View report
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="pv-btn pv-btn--ghost pv-btn--xs"
                        onClick={() => {
                          const h = mine.find((x) => x.id === s.hackathonId)
                          if (h) openSubmitForm(h)
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="pv-card">
        <div className="pv-card__header">
          <div>
            <h3 className="pv-card__title">My hackathons</h3>
            <p className="pv-card__subtitle">
              {mine.length} registration{mine.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {mine.length === 0 ? (
          <div className="pv-empty">
            <span className="pv-empty__icon">
              <Icon name="calendar" size={20} />
            </span>
            <h4 className="pv-empty__title">No registrations yet</h4>
            <p className="pv-empty__text">
              Register for an open event below and it will show up here with its prize status.
            </p>
          </div>
        ) : (
          <div className="pv-card__body pv-card__body--flush">
            <div className="pv-table-wrap">
              <table className="pv-table pv-table--hover">
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Status</th>
                    <th scope="col">My standing</th>
                    <th scope="col" className="pv-table__num">
                      Prize
                    </th>
                    <th scope="col" className="pv-table__actions">
                      &nbsp;
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((h) => {
                    const status = deriveStatus(h)
                    const meta = STATUS_META[status]
                    const participant = h.participants?.find(
                      (p) => p.payoutAddress?.toLowerCase() === userWallet.toLowerCase(),
                    )
                    const win = findWinnerForAccount(h, userWallet)
                    return (
                      <tr key={h.id}>
                        <td data-label="Event">
                          <span className="pv-table__primary">{h.name}</span>
                          <span className="pv-table__sub">
                            {formatDateRange(h.startDate, h.endDate)}
                          </span>
                        </td>
                        <td data-label="Status">
                          <span className={`pv-badge ${meta.badge}`.trim()}>
                            {status === 'live' ? (
                              <span className="pv-badge__dot pv-badge__dot--pulse" />
                            ) : null}
                            {meta.label}
                          </span>
                        </td>
                        <td data-label="My standing">
                          {win ? (
                            <span className="pv-badge pv-badge--success">
                              <Icon name="trophy" size={12} />
                              {win.prizeTier || 'Winner'}
                            </span>
                          ) : (
                            <span className="pv-badge">{participant?.status ?? 'registered'}</span>
                          )}
                        </td>
                        <td className="pv-table__num" data-label="Prize">
                          {win ? (
                            <strong>
                              {formatXlm(win.prizeAmount)} {prizeCurrency(h)}
                            </strong>
                          ) : (
                            <span className="pv-dim">--</span>
                          )}
                        </td>
                        <td className="pv-table__actions" data-label="Actions">
                          <div className="pv-btn-group">
                            <button
                              type="button"
                              className="pv-btn pv-btn--secondary pv-btn--xs"
                              onClick={() => openSubmitForm(h)}
                            >
                              {submissionByHackathon.has(h.id) ? 'Edit repo' : 'Submit repo'}
                            </button>
                            {submissionByHackathon.get(h.id)?.assessment ? (
                              <button
                                type="button"
                                className="pv-btn pv-btn--ghost pv-btn--xs"
                                onClick={() =>
                                  setReportSubmission(submissionByHackathon.get(h.id) || null)
                                }
                              >
                                Report
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="pv-btn pv-btn--ghost pv-btn--xs"
                              onClick={() => onNavigate?.('event', { hackathonId: h.id })}
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="pv-section__header">
          <div>
            <h3 className="pv-section__title">Open for registration</h3>
            <p className="pv-section__desc">
              {available.length} event{available.length === 1 ? '' : 's'} you have not joined yet.
            </p>
          </div>
        </div>

        {available.length === 0 ? (
          <div className="pv-card">
            <div className="pv-empty">
              <span className="pv-empty__icon">
                <Icon name="checkCircle" size={20} />
              </span>
              <h4 className="pv-empty__title">You are in every open event</h4>
              <p className="pv-empty__text">
                New events appear here as soon as organizers publish them.
              </p>
            </div>
          </div>
        ) : (
          <div className="pv-events">
            {available.map((h) => {
              const status = deriveStatus(h)
              const meta = STATUS_META[status]
              const cover = eventCover(h.name)
              const busy = registeringId === h.id

              return (
                <article className="pv-event" key={h.id} style={{ cursor: 'default' }}>
                  <div className="pv-event__cover" style={{ background: cover.background }}>
                    <span className="pv-event__cover-initials">{cover.initials}</span>
                    <span className={`pv-badge ${meta.badge} pv-event__cover-badge`.trim()}>
                      {status === 'live' ? (
                        <span className="pv-badge__dot pv-badge__dot--pulse" />
                      ) : null}
                      {meta.label}
                    </span>
                    <EventVerifiedBadge hackathon={h} />
                  </div>
                  <div className="pv-event__body">
                    <span className="pv-event__date">
                      <Icon name="calendar" size={13} />
                      {formatDateRange(h.startDate, h.endDate)}
                    </span>
                    <h4 className="pv-event__title">{h.name}</h4>
                    {h.description ? <p className="pv-event__desc">{h.description}</p> : null}
                    <div className="pv-event__meta">
                      <span className="pv-event__meta-item">
                        <Icon name="trophy" size={13} />
                        <span className="pv-event__prize">
                          {formatXlm(prizeTotal(h))} {prizeCurrency(h)}
                        </span>
                      </span>
                      <span className="pv-event__meta-item">
                        <Icon name="users" size={13} />
                        {participantCount(h)}
                      </span>
                    </div>
                    <div className="pv-btn-group" style={{ marginTop: 'var(--pv-space-5)' }}>
                      <button
                        type="button"
                        className="pv-btn pv-btn--primary pv-btn--sm"
                        disabled={busy}
                        onClick={() => handleRegister(h)}
                      >
                        {busy ? <span className="pv-btn__spinner" /> : null}
                        Register
                      </button>
                      <button
                        type="button"
                        className="pv-btn pv-btn--ghost pv-btn--sm"
                        onClick={() => onNavigate?.('event', { hackathonId: h.id })}
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      </>
      ) : null}
    </div>
  )
}
