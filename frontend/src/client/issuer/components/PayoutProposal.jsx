import React, { useMemo, useState } from 'react'
import Icon from '../../components/Icon'
import AddressChip from '../../components/AddressChip'
import { savePayoutProposals } from '../../utils/payoutProposalsStorage'
import { saveAllHackathons } from '../../services/hackathonApi'
import { hackathonBelongsToOrganizerPortal } from '../../utils/organizerPortalFilter'
import { appendIssuerAuditLog } from '../../utils/issuerAuditLog'
import { useHackathons, usePayoutProposals } from '../../hooks/useHackathons'
import { useEscrow } from '../../hooks/useEscrow'
import { formatDate, formatXlm, isEscrowFullyFunded, payoutStatusCopy, payoutReceiptUrl } from '../../utils/format'
import {
  canProposePayout,
  fundingGapXlm,
  getPayoutWorkflowStage,
  workflowSteps,
  WORKFLOW_STAGE_META,
} from '../../utils/payoutWorkflow'
import { evaluatePayment } from '@/lib/agent/evaluators'
import { AgentGates } from '../../components/AgentConsole'

function winnersTotal(proposal) {
  return (proposal.winners || []).reduce((s, w) => s + (Number(w.prizeAmount) || 0), 0)
}

/** Funded → organizer propose → sponsor approve → organizer release */
function ProposalSteps({ hackathon, proposal }) {
  const steps = workflowSteps(hackathon, proposal)
  const currentIndex = steps.findIndex((s) => !s.done)

  return (
    <ol className="pv-steps">
      {steps.map((step, i) => (
        <li
          key={step.label}
          className={`pv-step ${step.done ? 'is-done' : i === currentIndex ? 'is-current' : ''}`.trim()}
        >
          <span className="pv-step__marker">
            {step.done ? <Icon name="check" size={12} /> : i + 1}
          </span>
          <span className="pv-step__label">{step.label}</span>
          {i < steps.length - 1 ? <span className="pv-step__line" /> : null}
        </li>
      ))}
    </ol>
  )
}

export default function PayoutProposal({ hackathonId, sessionWallet, onExecute }) {
  const { hackathons } = useHackathons()
  const { proposals, reload: reloadProposals } = usePayoutProposals()
  const { proposePayouts, executePayout, loading: escrowBusy } = useEscrow()
  const [isProposingId, setIsProposingId] = useState(null)
  const [isExecutingId, setIsExecutingId] = useState(null)
  const [executeError, setExecuteError] = useState('')
  const [copiedId, setCopiedId] = useState(null)

  const myHackathons = useMemo(
    () => hackathons.filter((h) => hackathonBelongsToOrganizerPortal(h, sessionWallet)),
    [hackathons, sessionWallet],
  )

  const eligible = myHackathons.filter((h) => h.winnersSelected && h.winners?.length > 0)
  const readyToPropose = eligible.filter((h) => canProposePayout(h, proposals))
  const awaitingFunding = eligible.filter(
    (h) => !isEscrowFullyFunded(h) && !proposals.some((p) => p.hackathonId === h.id),
  )
  const displayProposals = proposals.filter((p) =>
    myHackathons.some((h) => h.id === p.hackathonId),
  )

  const handleCreateProposal = async (h) => {
    setExecuteError('')
    if (!canProposePayout(h, proposals)) {
      setExecuteError('Prize pool must be fully funded before proposing a payout.')
      return
    }
    setIsProposingId(h.id)
    try {
      const chainResult = await proposePayouts(h.winners || [])
      if (!chainResult.success) {
        throw new Error(chainResult.error || 'Propose payout failed')
      }

      const now = new Date().toISOString()

      // Ensure hackathon exists in Supabase before linking the proposal.
      const updatedHackathons = hackathons.map((x) =>
        x.id === h.id ? { ...x, payoutProposed: true } : x,
      )
      const syncedHackathons = await saveAllHackathons(updatedHackathons)
      const syncedHackathon = syncedHackathons.find((x) => x.id === h.id) || h

      const proposal = {
        id: `prop_${h.id}_${Date.now()}`,
        onChainProposalId: chainResult.proposalId,
        proposeTxHash: chainResult.txHash,
        hackathonId: syncedHackathon.id,
        hackathonDbId: syncedHackathon.dbId,
        hackathonName: syncedHackathon.name,
        createdAt: now,
        createdByWallet: sessionWallet,
        status: 'awaiting_sponsor',
        organizerApproved: true,
        sponsorApproved: false,
        winners: syncedHackathon.winners || h.winners || [],
        eventEndDate: syncedHackathon.endDate,
      }
      await savePayoutProposals([proposal, ...proposals])

      try {
        appendIssuerAuditLog({
          action: 'create_payout',
          hackathonId: h.id,
          txHash: chainResult.txHash,
          details: `Proposed INR payout (#${chainResult.proposalId}) for ${h.name}; ${h.winners?.length || 0} winner(s).`,
          wallet: sessionWallet,
        })
      } catch (_) {}
      reloadProposals()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Propose payout failed', error)
      setExecuteError(error instanceof Error ? error.message : 'Failed to propose payout')
    } finally {
      setIsProposingId(null)
    }
  }

  const handleExecutePayout = async (proposal) => {
    setExecuteError('')
    setIsExecutingId(proposal.id)
    try {
      const onChainId = Number(proposal.onChainProposalId)
      if (!Number.isFinite(onChainId)) {
        throw new Error(
          'This proposal has no onChainProposalId. Create a new proposal via the API/contract path.',
        )
      }

      const winners = (proposal.winners || []).filter(
        (w) => w?.payoutAddress && Number(w?.prizeAmount || 0) > 0,
      )
      const hackathon = hackathons.find((x) => x.id === proposal.hackathonId)
      const chainResult = await executePayout(onChainId, {
        winners,
        vaultBalanceInr: Number(hackathon?.sponsorFundingXlm || 0),
        hackathonId: proposal.hackathonId,
      })
      if (!chainResult.success) {
        throw new Error(chainResult.error || 'INR payout execute failed')
      }

      const updated = proposals.map((p) =>
        p.id === proposal.id
          ? {
              ...p,
              status: 'executed',
              txHash: chainResult.txHash,
              executedAt: new Date().toISOString(),
            }
          : p,
      )
      await savePayoutProposals(updated)

      const updatedHackathons = hackathons.map((x) =>
        x.id === proposal.hackathonId
          ? {
              ...x,
              payoutExecuted: true,
              payoutTxHash: chainResult.txHash,
              status: 'completed',
              winnersSelected: true,
            }
          : x,
      )
      await saveAllHackathons(updatedHackathons)

      reloadProposals()
      appendIssuerAuditLog({
        action: 'execute',
        hackathonId: proposal.hackathonId,
        txHash: chainResult.txHash,
        details: `Executed INR payout (#${onChainId}) for ${proposal.hackathonName}; ${winners.length} winner(s).`,
        wallet: sessionWallet,
      })
      onExecute?.(proposal)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Execute payout failed', error)
      setExecuteError(error instanceof Error ? error.message : 'Failed to execute payout')
    } finally {
      setIsExecutingId(null)
    }
  }

  /** Winners JSON for audit / export. Prize amounts in INR. */
  const getReleaseAppWinnersJson = (p) => {
    const winners = (p.winners || []).filter((w) => w.payoutAddress && (w.prizeAmount || 0) > 0)
    return JSON.stringify(
      winners.map((w) => ({
        destination: w.payoutAddress.trim(),
        amountInr: Number(w.prizeAmount || 0),
      })),
    )
  }

  const copyJson = (p) => {
    navigator.clipboard?.writeText(getReleaseAppWinnersJson(p))
    setCopiedId(p.id)
    window.setTimeout(() => setCopiedId(null), 1800)
  }

  return (
    <div className="pv-stack pv-stack--lg">
      {awaitingFunding.length > 0 ? (
        <section className="pv-card">
          <div className="pv-card__header">
            <div>
              <h3 className="pv-card__title">Waiting on sponsor funding</h3>
              <p className="pv-card__subtitle">
                Winners are chosen, but the escrow must be fully funded before you can propose a
                payout.
              </p>
            </div>
          </div>
          <div className="pv-card__body pv-card__body--flush">
            {awaitingFunding.map((h) => (
              <div
                className="pv-row pv-row--between"
                key={h.id}
                style={{
                  padding: 'var(--pv-space-6) var(--pv-space-7)',
                  borderBottom: '1px solid var(--pv-border-subtle)',
                }}
              >
                <div>
                  <span className="pv-table__primary">{h.name}</span>
                  <span className="pv-table__sub">
                    {formatXlm(fundingGapXlm(h))} INR still needed in the vault
                  </span>
                </div>
                <span className="pv-badge pv-badge--warning">Awaiting funding</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {readyToPropose.length > 0 ? (
        <section className="pv-card">
          <div className="pv-card__header">
            <div>
              <h3 className="pv-card__title">Ready to propose</h3>
              <p className="pv-card__subtitle">
                Escrow is funded and winners are chosen. Proposing is the organizer dual-control
                step and sends the payout to the sponsor for co-approval.
              </p>
            </div>
          </div>
          <div className="pv-card__body pv-card__body--flush">
            {readyToPropose.map((h) => (
              <div
                className="pv-row pv-row--between"
                key={h.id}
                style={{
                  padding: 'var(--pv-space-6) var(--pv-space-7)',
                  borderBottom: '1px solid var(--pv-border-subtle)',
                }}
              >
                <div>
                  <span className="pv-table__primary">{h.name}</span>
                  <span className="pv-table__sub">
                    Ended {formatDate(h.endDate)} &middot; {h.winners?.length || 0} winner
                    {h.winners?.length === 1 ? '' : 's'} &middot;{' '}
                    {formatXlm((h.winners || []).reduce((s, w) => s + (Number(w.prizeAmount) || 0), 0))}{' '}
                    INR
                  </span>
                </div>
                <button
                  type="button"
                  className="pv-btn pv-btn--primary pv-btn--sm"
                  onClick={() => handleCreateProposal(h)}
                  disabled={isProposingId === h.id || escrowBusy}
                >
                  {isProposingId === h.id ? (
                    <>
                      <span className="pv-btn__spinner" />
                      Proposing payout
                    </>
                  ) : (
                    <>
                      <Icon name="send" size={14} />
                      Create proposal
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {executeError ? (
        <div className="pv-alert pv-alert--danger" role="alert" aria-live="assertive">
          <span className="pv-alert__icon">
            <Icon name="alert" size={16} />
          </span>
          <div className="pv-alert__content">
            <p className="pv-alert__title">Payout failed</p>
            <p className="pv-alert__text" style={{ overflowWrap: 'anywhere' }}>
              {executeError}
            </p>
          </div>
          <button
            type="button"
            className="pv-btn pv-btn--ghost pv-btn--xs pv-btn--icon"
            onClick={() => setExecuteError('')}
            aria-label="Dismiss error"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ) : null}

      <section className="pv-stack">
        {displayProposals.length === 0 ? (
          <div className="pv-card">
            <div className="pv-empty">
              <span className="pv-empty__icon">
                <Icon name="send" size={20} />
              </span>
              <h3 className="pv-empty__title">No payout proposals yet</h3>
              <p className="pv-empty__text">
                {eligible.length === 0
                  ? 'Select winners for a completed event first, then propose the payout here.'
                  : 'Use "Create proposal" above to send a payout to the sponsor for approval.'}
              </p>
            </div>
          </div>
        ) : (
          displayProposals.map((p) => {
            const hackForProposal = hackathons.find((h) => h.id === p.hackathonId)
            const stage = hackForProposal
              ? getPayoutWorkflowStage(hackForProposal, [p])
              : 'awaiting_sponsor'
            const stageMeta = WORKFLOW_STAGE_META[stage]
            const organizerHint =
              (hackForProposal?.organizerAddress || '').trim() ||
              (sessionWallet || '').trim() ||
              'Sign in as organizer'
            const bothApproved = p.organizerApproved && p.sponsorApproved
            const total = winnersTotal(p)

            return (
              <article className="pv-card" key={p.id}>
                <div className="pv-card__header">
                  <div>
                    <h3 className="pv-card__title">{p.hackathonName}</h3>
                    <p className="pv-card__subtitle">
                      Event ended {formatDate(p.eventEndDate)} &middot; proposed{' '}
                      {formatDate(p.createdAt)}
                    </p>
                  </div>
                  <div className="pv-card__actions">
                    <span className={`pv-badge ${stageMeta.badge}`.trim()}>{stageMeta.label}</span>
                  </div>
                </div>

                <div className="pv-card__body">
                  {hackForProposal ? (
                    <>
                      <ProposalSteps hackathon={hackForProposal} proposal={p} />
                      <p className="pv-muted" style={{ marginTop: 'var(--pv-space-5)', fontSize: 'var(--pv-text-sm)' }}>
                        Payment gate (runs before money moves; the agent cannot skip this):
                      </p>
                      <AgentGates
                        gates={[
                          evaluatePayment(
                            p.winners || [],
                            Number(hackForProposal.sponsorFundingXlm || 0),
                          ),
                          ...(hackForProposal.agent?.gates || []).filter((g) => String(g.code).startsWith('GIT')),
                        ]}
                      />
                    </>
                  ) : (
                    <ProposalSteps hackathon={{ payoutProposed: true }} proposal={p} />
                  )}

                  <div className="pv-table-wrap" style={{ marginTop: 'var(--pv-space-8)' }}>
                    <table className="pv-table">
                      <thead>
                        <tr>
                          <th scope="col">Winner</th>
                          <th scope="col">Tier</th>
                          <th scope="col">Payout address</th>
                          <th scope="col" className="pv-table__num">
                            Amount (INR)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(p.winners || []).map((w, i) => (
                          <tr key={`${p.id}-${w.id || i}`}>
                            <td>
                              <span className="pv-table__primary">{w.name || 'Winner'}</span>
                              {w.team ? <span className="pv-table__sub">{w.team}</span> : null}
                            </td>
                            <td>
                              <span className="pv-badge">{w.prizeTier || '--'}</span>
                            </td>
                            <td>
                              <AddressChip address={w.payoutAddress} label="payout address" />
                            </td>
                            <td className="pv-table__num">{formatXlm(w.prizeAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} style={{ fontWeight: 'var(--pv-weight-semibold)' }}>
                            Total
                          </td>
                          <td
                            className="pv-table__num"
                            style={{ fontWeight: 'var(--pv-weight-semibold)' }}
                          >
                            {formatXlm(total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {bothApproved && p.status !== 'executed' ? (
                    <div className="pv-alert pv-alert--accent" style={{ marginTop: 'var(--pv-space-8)' }}>
                      <span className="pv-alert__icon">
                        <Icon name="info" size={16} />
                      </span>
                      <div className="pv-alert__content">
                        <p className="pv-alert__title">Both approvals complete</p>
                        <p className="pv-alert__text">
                          Execute sends gated Razorpay INR payouts to each winner. The orchestration
                          agent can also take this step after both sides approve. Organizer account:{' '}
                          <AddressChip address={organizerHint} label="organizer account" />.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="pv-card__footer" style={{ justifyContent: 'space-between' }}>
                  {p.status === 'executed' ? (
                    <>
                      <span className="pv-muted">
                        {payoutStatusCopy(p.txHash)} Released {p.executedAt ? formatDate(p.executedAt) : ''}
                      </span>
                      {(() => {
                        const event = myHackathons.find((h) => h.id === p.hackathonId)
                        const auditUrl = event?.agent?.lastReceiptUrl
                        const href = auditUrl || (p.txHash ? payoutReceiptUrl(p.txHash) : '#')
                        const isAudit = Boolean(auditUrl)
                        return (
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="pv-btn pv-btn--secondary pv-btn--sm"
                          >
                            {isAudit ? 'Open CloudFront audit' : 'View payout receipt'}
                            <Icon name="external" size={13} />
                          </a>
                        )
                      })()}
                    </>
                  ) : bothApproved ? (
                    <>
                      <button
                        type="button"
                        className="pv-btn pv-btn--ghost pv-btn--sm"
                        onClick={() => copyJson(p)}
                      >
                        <Icon name={copiedId === p.id ? 'check' : 'copy'} size={14} />
                        {copiedId === p.id ? 'Copied' : 'Copy winners JSON'}
                      </button>
                      <button
                        type="button"
                        className="pv-btn pv-btn--primary pv-btn--sm"
                        onClick={() => handleExecutePayout(p)}
                        disabled={isExecutingId === p.id}
                      >
                        {isExecutingId === p.id ? (
                          <>
                            <span className="pv-btn__spinner" />
                            Executing
                          </>
                        ) : (
                          <>
                            <Icon name="send" size={14} />
                            Execute INR payout
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <span className="pv-muted">
                      Waiting for the sponsor to co-approve in the sponsor console.
                    </span>
                  )}
                </div>
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
