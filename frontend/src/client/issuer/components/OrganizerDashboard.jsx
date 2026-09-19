import React, { useState } from 'react'
import Icon from '../../components/Icon'
import { hackathonBelongsToOrganizerPortal } from '../../utils/organizerPortalFilter'
import { deleteHackathon } from '../../services/hackathonApi'
import { useHackathons, usePayoutProposals } from '../../hooks/useHackathons'
import {
  STATUS_META,
  deriveStatus,
  formatDateRange,
  formatXlm,
  isEscrowFullyFunded,
  participantCount,
  prizeCurrency,
  prizeTotal,
} from '../../utils/format'
import {
  getPayoutWorkflowStage,
  WORKFLOW_STAGE_META,
} from '../../utils/payoutWorkflow'
import { useAgentInbox } from '../../hooks/useAgentInbox'
import AgentInbox from '../../components/AgentInbox'
import AgentConsole from '../../components/AgentConsole'
import AgentAlertsSubscribe from '../../components/AgentAlertsSubscribe'

function HackathonRow({ hackathon, sessionWallet, onNavigate, onDeleted, proposals }) {
  const status = deriveStatus(hackathon)
  const meta = STATUS_META[status]
  const workflowStage = getPayoutWorkflowStage(hackathon, proposals)
  const workflowMeta = WORKFLOW_STAGE_META[workflowStage]
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    const ok = window.confirm(
      `Delete hackathon "${hackathon.name}"? This removes it for sponsors and participants and deletes related proposals.`,
    )
    if (!ok) return

    setDeleting(true)
    const result = await deleteHackathon(hackathon.id, sessionWallet)
    setDeleting(false)

    if (!result.success) {
      window.alert(result.error || 'Could not delete hackathon.')
      return
    }
    onDeleted?.()
  }

  return (
    <tr>
      <td data-label="Event">
        <span className="pv-table__primary">{hackathon.name || 'Untitled'}</span>
        <span className="pv-table__sub">
          {formatDateRange(hackathon.startDate, hackathon.endDate)}
        </span>
      </td>
      <td data-label="Status">
        <span className={`pv-badge ${meta.badge}`.trim()}>
          {status === 'live' ? <span className="pv-badge__dot pv-badge__dot--pulse" /> : null}
          {meta.label}
        </span>
      </td>
      <td className="pv-table__num" data-label="Prize pool">
        {formatXlm(prizeTotal(hackathon))}{' '}
        <span className="pv-dim">{prizeCurrency(hackathon)}</span>
      </td>
      <td className="pv-table__num" data-label="Registered">{participantCount(hackathon)}</td>
      <td data-label="Payout stage">
        <span className={`pv-badge ${workflowMeta.badge}`.trim()}>{workflowMeta.label}</span>
      </td>
      <td className="pv-table__actions" data-label="Actions">
        <span className="pv-btn-group">
          <button
            type="button"
            className="pv-btn pv-btn--ghost pv-btn--xs"
            onClick={() => onNavigate?.('participants', hackathon.id)}
          >
            Participants
          </button>
          <button
            type="button"
            className="pv-btn pv-btn--ghost pv-btn--xs"
            onClick={() => onNavigate?.('winners', hackathon.id)}
          >
            Winners
          </button>
          <button
            type="button"
            className="pv-btn pv-btn--ghost pv-btn--xs"
            onClick={() => onNavigate?.('payouts', hackathon.id)}
          >
            Payout
          </button>
          <button
            type="button"
            className="pv-btn pv-btn--ghost pv-btn--xs pv-btn--icon"
            onClick={handleDelete}
            disabled={deleting}
            aria-label={`Delete ${hackathon.name}`}
            title="Delete hackathon"
          >
            {deleting ? <span className="pv-btn__spinner" /> : <Icon name="trash" size={13} />}
          </button>
        </span>
      </td>
    </tr>
  )
}

export default function OrganizerDashboard({ sessionWallet, onNavigate }) {
  const { hackathons, reload } = useHackathons((h) => hackathonBelongsToOrganizerPortal(h, sessionWallet))
  const { proposals } = usePayoutProposals()
  const { unread, dismiss, tickResult, tickBusy, reload: reloadInbox } = useAgentInbox(sessionWallet)

  const needFunding = hackathons.filter((h) => !isEscrowFullyFunded(h) && deriveStatus(h) !== 'completed')
  const needWinners = hackathons.filter(
    (h) => isEscrowFullyFunded(h) && deriveStatus(h) === 'completed' && !h.winnersSelected,
  )
  const needProposal = hackathons.filter(
    (h) => getPayoutWorkflowStage(h, proposals) === 'winners_selected',
  )
  const awaitingApproval = hackathons.filter(
    (h) => getPayoutWorkflowStage(h, proposals) === 'awaiting_sponsor',
  )
  const readyToRelease = hackathons.filter(
    (h) => getPayoutWorkflowStage(h, proposals) === 'ready_to_release',
  )

  const nudges = [
    needFunding.length > 0 && {
      icon: 'lock',
      tone: 'pv-alert--warning',
      title: `${needFunding.length} ${needFunding.length === 1 ? 'event is' : 'events are'} waiting on sponsor funding`,
      text: 'The sponsor must lock the full prize pool in escrow before judging or payouts can begin.',
      cta: 'View events',
      view: 'hackathons',
      id: needFunding[0].id,
    },
    needWinners.length > 0 && {
      icon: 'trophy',
      tone: 'pv-alert--warning',
      title: `${needWinners.length} completed ${needWinners.length === 1 ? 'event needs' : 'events need'} winners`,
      text: needWinners.map((h) => h.name).join(', '),
      cta: 'Select winners',
      view: 'winners',
      id: needWinners[0].id,
    },
    needProposal.length > 0 && {
      icon: 'send',
      tone: 'pv-alert--accent',
      title: `${needProposal.length} ${needProposal.length === 1 ? 'event has' : 'events have'} winners ready to propose`,
      text: 'Escrow is funded. Propose the payout so the sponsor can co-approve the winner list.',
      cta: 'Create payout',
      view: 'payouts',
      id: needProposal[0].id,
    },
    awaitingApproval.length > 0 && {
      icon: 'clock',
      tone: '',
      title: `${awaitingApproval.length} payout ${awaitingApproval.length === 1 ? 'proposal' : 'proposals'} awaiting sponsor approval`,
      text: 'The sponsor must co-approve the winner list before you can release funds.',
      cta: 'View payouts',
      view: 'payouts',
      id: awaitingApproval[0].id,
    },
    readyToRelease.length > 0 && {
      icon: 'checkCircle',
      tone: 'pv-alert--accent',
      title: `${readyToRelease.length} payout ${readyToRelease.length === 1 ? 'is' : 'are'} ready to release`,
      text: 'Both sides approved. The agent will run payment/git gates and post a receipt. If you see pout_queued_… that is queued (no RazorpayX), not a bank credit.',
      cta: 'Release payout',
      view: 'payouts',
      id: readyToRelease[0].id,
    },
  ].filter(Boolean)

  return (
    <div className="pv-stack pv-stack--lg">
      <div className="pv-row pv-row--between">
        <div className="pv-btn-group">
          <button
            type="button"
            className="pv-btn pv-btn--primary"
            onClick={() => onNavigate?.('create-hackathon')}
          >
            <Icon name="plus" size={15} />
            Create hackathon
          </button>
          <a href="/holder" className="pv-btn pv-btn--secondary">
            <Icon name="wallet" size={15} />
            Open participant portal
          </a>
        </div>
      </div>

      <AgentInbox
        notifications={unread}
        onOpen={(notice) => onNavigate?.(notice.view || 'dashboard', notice.hackathonId)}
        onDismiss={dismiss}
      />

      <AgentConsole
        tick={tickResult}
        busy={tickBusy}
        onRun={() => void reloadInbox()}
        hackathons={hackathons}
      />

      <AgentAlertsSubscribe />

      {nudges.length > 0 ? (
        <div className="pv-stack pv-stack--sm">
          {nudges.map((n) => (
            <div className={`pv-alert ${n.tone}`.trim()} key={n.title}>
              <span className="pv-alert__icon">
                <Icon name={n.icon} size={16} />
              </span>
              <div className="pv-alert__content">
                <p className="pv-alert__title">{n.title}</p>
                <p className="pv-alert__text">{n.text}</p>
              </div>
              <button
                type="button"
                className="pv-btn pv-btn--secondary pv-btn--sm"
                onClick={() => onNavigate?.(n.view, n.id)}
              >
                {n.cta}
              </button>
            </div>
          ))}
        </div>
      ) : hackathons.length > 0 ? (
        <div className="pv-alert pv-alert--success">
          <span className="pv-alert__icon">
            <Icon name="checkCircle" size={16} />
          </span>
          <div className="pv-alert__content">
            <p className="pv-alert__title">Nothing needs your attention</p>
            <p className="pv-alert__text">
              Every event either has no results yet or has a payout already in flight.
            </p>
          </div>
        </div>
      ) : null}

      <section className="pv-card">
        <div className="pv-card__header">
          <div>
            <h3 className="pv-card__title">My hackathons</h3>
            <p className="pv-card__subtitle">
              {hackathons.length} event{hackathons.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="pv-card__actions">
            <button
              type="button"
              className="pv-btn pv-btn--ghost pv-btn--sm"
              onClick={() => onNavigate?.('hackathons')}
            >
              See all
              <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </div>

        {hackathons.length === 0 ? (
          <div className="pv-empty">
            <span className="pv-empty__icon">
              <Icon name="calendar" size={20} />
            </span>
            <h4 className="pv-empty__title">No hackathons yet</h4>
            <p className="pv-empty__text">
              Create your first event to set a prize pool, register participants and run a payout
              through escrow.
            </p>
            <button
              type="button"
              className="pv-btn pv-btn--primary pv-btn--sm"
              onClick={() => onNavigate?.('create-hackathon')}
            >
              <Icon name="plus" size={14} />
              Create hackathon
            </button>
          </div>
        ) : (
          <div className="pv-card__body pv-card__body--flush">
            <div className="pv-table-wrap">
              <table className="pv-table pv-table--hover">
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="pv-table__num">
                      Prize pool
                    </th>
                    <th scope="col" className="pv-table__num">
                      Registered
                    </th>
                    <th scope="col">Payout stage</th>
                    <th scope="col" className="pv-table__actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {hackathons.map((h) => (
                    <HackathonRow
                      key={h.id}
                      hackathon={h}
                      sessionWallet={sessionWallet}
                      onNavigate={onNavigate}
                      onDeleted={reload}
                      proposals={proposals}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
