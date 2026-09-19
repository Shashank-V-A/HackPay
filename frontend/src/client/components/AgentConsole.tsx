import Icon from './Icon'
import type { AgentTickResult, GateResult, Hackathon } from '../types/hackathon'
import { isQueuedPayoutReceipt, payoutStatusCopy } from '../utils/format'

function formatTickTime(iso?: string) {
  if (!iso) return 'Not run yet'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

function gateBadge(gate: GateResult) {
  if (gate.ok) return 'pv-badge--success'
  return 'pv-badge--danger'
}

export function AgentGates({ gates }: { gates?: GateResult[] | null }) {
  if (!gates?.length) return null
  return (
    <div className="pv-stack pv-stack--sm" style={{ marginTop: 'var(--pv-space-5)' }}>
      {gates.map((gate) => (
        <div key={gate.code + gate.detail} className="pv-row pv-row--between">
          <span className={`pv-badge ${gateBadge(gate)}`.trim()}>{gate.code}</span>
          <span className="pv-muted" style={{ fontSize: 'var(--pv-text-sm)', maxWidth: '52ch' }}>
            {gate.detail}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function AgentConsole({
  tick,
  busy,
  onRun,
  hackathons = [],
}: {
  tick: AgentTickResult | null
  busy?: boolean
  onRun?: () => void
  hackathons?: Hackathon[]
}) {
  const stored = hackathons.flatMap((h) =>
    (h.agent?.log || []).map((entry) => ({
      ...entry,
      event: h.name,
    })),
  )
  const actions = tick?.actions?.length
    ? tick.actions
    : stored.slice(-8).map((entry) => ({
        stage: entry.stage,
        hackathonId: entry.hackathonId,
        hackathonName: entry.hackathonName,
        detail: entry.detail,
        txHash: entry.txHash,
      }))
  const withAgent = hackathons.filter((h) => h.agent)
  const gates = withAgent.find((h) => h.agent?.gates?.length)?.agent?.gates
  const receiptHack =
    withAgent.find((h) => h.agent?.lastReceiptUrl) ||
    withAgent.find((h) => h.agent?.lastReceipt)
  const receipt = receiptHack?.agent?.lastReceipt || tick?.actions?.find((a) => a.txHash)?.txHash
  const receiptUrl = receiptHack?.agent?.lastReceiptUrl
  const adviceHack = withAgent.find((h) => h.agent?.suggestions?.length || h.agent?.timelineSummary)
  const suggestions = adviceHack?.agent?.suggestions || []
  const timelineSummary = adviceHack?.agent?.timelineSummary
  const nextSteps = adviceHack?.agent?.nextSteps || []

  return (
    <section className="pv-card" style={{ animation: 'pv-fade-in 0.45s ease both' }}>
      <div className="pv-card__header">
        <div>
          <h3 className="pv-card__title">Agent orchestration log</h3>
          <p className="pv-card__subtitle">
            Background payout agent — not the Event Timeline schedule. Last tick{' '}
            {formatTickTime(tick?.ranAt || hackathons.find((h) => h.agent?.lastTickAt)?.agent?.lastTickAt)}
            {tick?.source ? ` · ${tick.source}` : ''}
          </p>
        </div>
        {onRun ? (
          <button type="button" className="pv-btn pv-btn--secondary pv-btn--sm" onClick={onRun} disabled={busy}>
            {busy ? <span className="pv-btn__spinner" /> : <Icon name="refresh" size={14} />}
            Run tick
          </button>
        ) : null}
      </div>
      <div className="pv-card__body">
        <p className="pv-muted" style={{ fontSize: 'var(--pv-text-sm)', marginBottom: 'var(--pv-space-5)' }}>
          {tick?.summary
            || hackathons.find((h) => h.agent?.summary)?.agent?.summary
            || 'The agent watches funding, winners, dual approval, then payment/git gates. It cannot approve payouts; humans still do that.'}
        </p>
        {tick?.error ? (
          <div className="pv-alert pv-alert--warning" style={{ marginBottom: 'var(--pv-space-5)' }}>
            <span className="pv-alert__icon">
              <Icon name="alert" size={16} />
            </span>
            <div className="pv-alert__content">
              <p className="pv-alert__text">{tick.error}</p>
            </div>
          </div>
        ) : null}

        {(timelineSummary || suggestions.length > 0) ? (
          <div style={{ marginBottom: 'var(--pv-space-5)' }}>
            <p className="pv-muted" style={{ fontSize: 'var(--pv-text-sm)', marginBottom: 'var(--pv-space-3)' }}>
              <strong>Latest Strands advice</strong>
              {adviceHack?.name ? ` · ${adviceHack.name}` : ''}
            </p>
            {timelineSummary ? (
              <p className="pv-dim" style={{ fontSize: 'var(--pv-text-sm)', marginBottom: 'var(--pv-space-3)' }}>
                {timelineSummary}
              </p>
            ) : null}
            {suggestions.length > 0 ? (
              <ul className="pv-stack pv-stack--sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {suggestions
                  .slice()
                  .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                  .slice(0, 5)
                  .map((s) => (
                    <li key={s.participantId}>
                      <span className="pv-badge">#{s.rank}</span>{' '}
                      <strong>{s.name}</strong>
                      <span className="pv-table__sub">
                        {' '}
                        score {Number(s.score).toFixed(1)}
                        {s.rationale ? ` — ${s.rationale}` : ''}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
            {nextSteps.length > 0 ? (
              <p className="pv-dim" style={{ fontSize: 'var(--pv-text-sm)', marginTop: 'var(--pv-space-3)' }}>
                Next: {nextSteps.slice(0, 3).join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {actions.length === 0 ? (
          <p className="pv-dim">No actions this tick. Open this page after an event ends, after winners are saved, or after both sides approve.</p>
        ) : (
          <ul className="pv-stack pv-stack--sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {actions.map((action, index) => (
              <li key={`${action.hackathonId}-${action.stage}-${index}`} className="pv-row pv-row--between">
                <span>
                  <span className="pv-badge">{action.stage}</span>{' '}
                  <strong>{action.hackathonName}</strong>
                  <span className="pv-table__sub">{action.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <AgentGates gates={gates} />

        {receipt ? (
          <p className="pv-muted" style={{ marginTop: 'var(--pv-space-5)', fontSize: 'var(--pv-text-sm)' }}>
            Receipt <span className="pv-mono">{receipt}</span>
            {isQueuedPayoutReceipt(receipt) ? ` — ${payoutStatusCopy(receipt)}` : ''}
            {receiptUrl ? (
              <>
                {' · '}
                <a href={receiptUrl} target="_blank" rel="noreferrer">
                  Open CloudFront audit JSON
                  <Icon name="external" size={12} />
                </a>
              </>
            ) : null}
          </p>
        ) : null}

        {withAgent.some((h) => h.agent?.lastReceiptUrl) ? (
          <ul className="pv-stack pv-stack--sm" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--pv-space-4)' }}>
            {withAgent
              .filter((h) => h.agent?.lastReceiptUrl)
              .slice(0, 5)
              .map((h) => (
                <li key={h.id}>
                  <a href={h.agent!.lastReceiptUrl!} target="_blank" rel="noreferrer">
                    {h.name} audit receipt
                  </a>
                  {h.agent?.lastReceipt ? (
                    <span className="pv-table__sub"> · {h.agent.lastReceipt}</span>
                  ) : null}
                </li>
              ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
