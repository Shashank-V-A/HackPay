import React, { useState } from 'react'
import Icon from './Icon'
import { authHeaders } from '../utils/authSession'

/** Subscribe an email to SNS agent alerts (confirm via AWS email). */
export default function AgentAlertsSubscribe() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const subscribe = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/aws/sns/subscribe', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        message?: string
        error?: string
        pendingConfirm?: boolean
      }
      if (!res.ok || !data.ok) {
        setError(data.error || 'Could not subscribe.')
        return
      }
      setMessage(
        data.message ||
          (data.pendingConfirm
            ? 'Check your inbox and confirm the AWS SNS subscription.'
            : 'Subscribed to agent alerts.'),
      )
    } catch (_) {
      setError('Could not subscribe.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pv-card">
      <div className="pv-card__header">
        <div>
          <h3 className="pv-card__title">Agent alert email</h3>
          <p className="pv-card__subtitle">
            Subscribe to SNS for instant HackPay agent alerts (funding, winners, payout). Confirm the
            AWS email before messages arrive — great for a demo video.
          </p>
        </div>
      </div>
      <div className="pv-card__body">
        {error ? (
          <div className="pv-alert pv-alert--warning" style={{ marginBottom: 'var(--pv-space-5)' }}>
            <span className="pv-alert__icon">
              <Icon name="alert" size={16} />
            </span>
            <div className="pv-alert__content">
              <p className="pv-alert__text">{error}</p>
            </div>
          </div>
        ) : null}
        {message ? (
          <div className="pv-alert pv-alert--success" style={{ marginBottom: 'var(--pv-space-5)' }}>
            <span className="pv-alert__icon">
              <Icon name="checkCircle" size={16} />
            </span>
            <div className="pv-alert__content">
              <p className="pv-alert__text">{message}</p>
            </div>
          </div>
        ) : null}
        <div className="pv-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--pv-space-4)' }}>
          <div className="pv-field" style={{ flex: '1 1 220px', minWidth: 0 }}>
            <label className="pv-field__label" htmlFor="sns-alert-email">
              Email
            </label>
            <input
              id="sns-alert-email"
              type="email"
              className="pv-input"
              placeholder="you@college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <button
            type="button"
            className="pv-btn pv-btn--primary"
            onClick={() => void subscribe()}
            disabled={busy || !email.trim()}
          >
            {busy ? <span className="pv-btn__spinner" /> : <Icon name="send" size={14} />}
            Subscribe
          </button>
        </div>
      </div>
    </div>
  )
}
