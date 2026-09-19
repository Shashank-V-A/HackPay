import React, { useCallback, useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import AgentAlertsSubscribe from '../../components/AgentAlertsSubscribe'

/**
 * Two-factor auth for the organizer console.
 *
 * These six endpoints are served by a separate backend on :3000, reachable in
 * development through the Vite proxy (see vite.config.js). There is no `/2fa`
 * rewrite in vercel.json, so on a deployed build the backend is simply absent --
 * that is treated as an "unavailable" state with an explanation, not as an error
 * the organizer is expected to act on.
 */
const API_KEY = import.meta.env?.VITE_ISSUER_API_KEY || 'demo-key'

function apiHeaders() {
  return { 'Content-Type': 'application/json', 'X-API-Key': API_KEY }
}

/** A network-level failure means no backend, which is different from a 4xx. */
async function call(path, init) {
  try {
    const response = await fetch(path, { headers: apiHeaders(), ...init })
    return { response, unreachable: false }
  } catch (_) {
    return { response: null, unreachable: true }
  }
}

async function errorFrom(response, fallback) {
  try {
    const data = await response.json()
    return data?.error || fallback
  } catch (_) {
    return fallback
  }
}

const CODE_LENGTH = 6

export default function TwoFASetup() {
  const [status, setStatus] = useState(null)
  const [step, setStep] = useState('status') // status | verify | enabled
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [setupSecret, setSetupSecret] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [backupCodes, setBackupCodes] = useState([])
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [copied, setCopied] = useState(false)

  const checkStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    const { response, unreachable } = await call('/2fa/status', { method: 'GET' })
    if (unreachable) {
      setUnavailable(true)
      setLoading(false)
      return
    }
    setUnavailable(false)
    if (response.ok) {
      const result = await response.json()
      setStatus(result)
      setStep(result.enabled ? 'enabled' : 'status')
    } else {
      setError(await errorFrom(response, 'Could not read the current 2FA status.'))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  const handleSetup = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    const { response, unreachable } = await call('/2fa/setup', {
      method: 'POST',
      body: JSON.stringify({
        issuerName: 'MVJ College of Engineering',
        accountName: 'issuer@mvjcollege.edu',
      }),
    })
    if (unreachable) {
      setUnavailable(true)
    } else if (!response.ok) {
      setError(await errorFrom(response, 'Failed to start 2FA setup.'))
    } else {
      setSetupSecret(await response.json())
      setStep('verify')
      setSuccess('Scan the QR code with your authenticator app, then enter the 6-digit code.')
    }
    setLoading(false)
  }

  const handleVerify = async () => {
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from your authenticator app.`)
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')

    const verify = await call('/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ token: code, secret: setupSecret.secret }),
    })
    if (verify.unreachable) {
      setUnavailable(true)
      setLoading(false)
      return
    }
    if (!verify.response.ok) {
      setError(await errorFrom(verify.response, 'Invalid verification code.'))
      setLoading(false)
      return
    }
    const verifyResult = await verify.response.json()
    if (!verifyResult.success) {
      setError('That code did not match. Check your authenticator app and try again.')
      setLoading(false)
      return
    }

    const enable = await call('/2fa/enable', {
      method: 'POST',
      body: JSON.stringify({
        secret: setupSecret.secret,
        token: code,
        backupCodes: setupSecret.backupCodes,
      }),
    })
    if (enable.unreachable) {
      setUnavailable(true)
      setLoading(false)
      return
    }
    if (!enable.response.ok) {
      setError(await errorFrom(enable.response, 'Failed to enable 2FA.'))
      setLoading(false)
      return
    }
    const enableResult = await enable.response.json()
    setBackupCodes(enableResult.backupCodes || setupSecret.backupCodes || [])
    setShowBackupCodes(true)
    setStep('enabled')
    setSuccess('Two-factor authentication is on. Save your backup codes somewhere safe.')
    setCode('')
    setLoading(false)
    await checkStatus()
  }

  const handleDisable = async () => {
    const ok = window.confirm(
      'Disable two-factor authentication? This removes the second factor protecting payout and revocation actions.',
    )
    if (!ok) return
    if (code.length !== CODE_LENGTH) {
      setError('Enter your current 2FA code to disable it.')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    const { response, unreachable } = await call('/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ token: code }),
    })
    if (unreachable) {
      setUnavailable(true)
    } else if (!response.ok) {
      setError(await errorFrom(response, 'Failed to disable 2FA. Check the code and try again.'))
    } else {
      setStep('status')
      setBackupCodes([])
      setShowBackupCodes(false)
      setSuccess('Two-factor authentication is off.')
      setCode('')
      await checkStatus()
    }
    setLoading(false)
  }

  const handleGetBackupCodes = async () => {
    if (code.length !== CODE_LENGTH) {
      setError('Enter your 2FA code to view backup codes.')
      return
    }
    setLoading(true)
    setError('')
    const { response, unreachable } = await call('/2fa/backup-codes', {
      method: 'POST',
      body: JSON.stringify({ token: code, regenerate: false }),
    })
    if (unreachable) {
      setUnavailable(true)
    } else if (!response.ok) {
      setError(await errorFrom(response, 'Failed to fetch backup codes.'))
    } else {
      const result = await response.json()
      setBackupCodes(result.backupCodes || [])
      setShowBackupCodes(true)
      setCode('')
    }
    setLoading(false)
  }

  const copyBackupCodes = () => {
    navigator.clipboard?.writeText(backupCodes.join('\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const codeInput = (label, onSubmit, submitLabel, variant = 'pv-btn--primary') => (
    <div className="pv-row" style={{ alignItems: 'flex-end' }}>
      <div className="pv-field" style={{ maxWidth: 180 }}>
        <label className="pv-field__label" htmlFor="twofa-code">
          {label}
        </label>
        <input
          id="twofa-code"
          className="pv-input pv-input--mono"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          style={{ letterSpacing: '0.28em', textAlign: 'center' }}
        />
      </div>
      <button
        type="button"
        className={`pv-btn ${variant}`}
        onClick={onSubmit}
        disabled={loading || code.length !== CODE_LENGTH}
      >
        {loading ? <span className="pv-btn__spinner" /> : null}
        {submitLabel}
      </button>
    </div>
  )

  // No backend in this environment -- say so plainly instead of showing a red
  // failure the organizer cannot do anything about.
  if (unavailable) {
    return (
      <div className="pv-stack pv-stack--lg">
        <AgentAlertsSubscribe />
        <div className="pv-card">
          <div className="pv-card__header">
            <div>
              <h3 className="pv-card__title">Two-factor authentication</h3>
              <p className="pv-card__subtitle">Extra confirmation for payout and revocation actions</p>
            </div>
            <div className="pv-card__actions">
              <span className="pv-badge">Unavailable</span>
            </div>
          </div>
          <div className="pv-empty">
            <span className="pv-empty__icon">
              <Icon name="shield" size={20} />
            </span>
            <h4 className="pv-empty__title">Not available in this environment</h4>
            <p className="pv-empty__text">
              2FA needs the HackPay API running on port 3000. Escrow, winner selection and payouts
              all work without it — they are secured by your signed-in account, not by this console.
            </p>
            <button
              type="button"
              className="pv-btn pv-btn--secondary pv-btn--sm"
              onClick={checkStatus}
              disabled={loading}
            >
              <Icon name="refresh" size={14} />
              Check again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pv-stack pv-stack--lg">
      <AgentAlertsSubscribe />
      <div className="pv-card">
        <div className="pv-card__header">
          <div>
            <h3 className="pv-card__title">Two-factor authentication</h3>
            <p className="pv-card__subtitle">
              Extra confirmation for payout and revocation actions
            </p>
          </div>
          <div className="pv-card__actions">
            {step === 'enabled' ? (
              <span className="pv-badge pv-badge--success">
                <span className="pv-badge__dot" />
                Enabled
              </span>
            ) : (
              <span className="pv-badge pv-badge--warning">Not enabled</span>
            )}
          </div>
        </div>

        <div className="pv-card__body">
          {error ? (
            <div
              className="pv-alert pv-alert--danger"
              role="alert"
              aria-live="polite"
              style={{ marginBottom: 'var(--pv-space-7)' }}
            >
              <span className="pv-alert__icon">
                <Icon name="alert" size={16} />
              </span>
              <div className="pv-alert__content">
                <p className="pv-alert__text">{error}</p>
              </div>
            </div>
          ) : null}

          {success ? (
            <div
              className="pv-alert pv-alert--success"
              role="status"
              aria-live="polite"
              style={{ marginBottom: 'var(--pv-space-7)' }}
            >
              <span className="pv-alert__icon">
                <Icon name="checkCircle" size={16} />
              </span>
              <div className="pv-alert__content">
                <p className="pv-alert__text">{success}</p>
              </div>
            </div>
          ) : null}

          {step === 'status' ? (
            <div className="pv-stack">
              <p className="pv-muted">
                Turn on 2FA to require a time-based code from your authenticator app before
                sensitive organizer actions.
              </p>
              <div>
                <button
                  type="button"
                  className="pv-btn pv-btn--primary"
                  onClick={handleSetup}
                  disabled={loading}
                >
                  {loading ? <span className="pv-btn__spinner" /> : <Icon name="shield" size={15} />}
                  Set up 2FA
                </button>
              </div>
            </div>
          ) : null}

          {step === 'verify' && setupSecret ? (
            <div className="pv-stack">
              {setupSecret.qrCode ? (
                <div>
                  <img
                    src={setupSecret.qrCode}
                    alt="Two-factor authentication QR code"
                    width={168}
                    height={168}
                    style={{
                      border: '1px solid var(--pv-border)',
                      borderRadius: 'var(--pv-radius-md)',
                      background: '#fff',
                      padding: 8,
                    }}
                  />
                </div>
              ) : null}
              {setupSecret.secret ? (
                <div className="pv-field">
                  <span className="pv-field__label">Or enter this secret manually</span>
                  <code style={{ overflowWrap: 'anywhere' }}>{setupSecret.secret}</code>
                </div>
              ) : null}
              {codeInput('Verification code', handleVerify, 'Verify and enable')}
            </div>
          ) : null}

          {step === 'enabled' ? (
            <div className="pv-stack pv-stack--lg">
              <div className="pv-alert pv-alert--success">
                <span className="pv-alert__icon">
                  <Icon name="lock" size={16} />
                </span>
                <div className="pv-alert__content">
                  <p className="pv-alert__title">This console is protected</p>
                  <p className="pv-alert__text">
                    {status?.enabledAt
                      ? `Enabled on ${new Date(status.enabledAt).toLocaleDateString()}.`
                      : 'Sensitive actions require a code from your authenticator app.'}
                  </p>
                </div>
              </div>

              {showBackupCodes && backupCodes.length > 0 ? (
                <div className="pv-card pv-card--flat">
                  <div className="pv-card__header">
                    <div>
                      <h4 className="pv-card__title" style={{ fontSize: 'var(--pv-text-md)' }}>
                        Backup codes
                      </h4>
                      <p className="pv-card__subtitle">
                        Each code works once. Store them outside this browser.
                      </p>
                    </div>
                    <div className="pv-card__actions">
                      <button
                        type="button"
                        className="pv-btn pv-btn--secondary pv-btn--sm"
                        onClick={copyBackupCodes}
                      >
                        <Icon name={copied ? 'check' : 'copy'} size={14} />
                        {copied ? 'Copied' : 'Copy all'}
                      </button>
                    </div>
                  </div>
                  <div className="pv-card__body pv-card__body--tight">
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                        gap: 'var(--pv-space-4)',
                      }}
                    >
                      {backupCodes.map((c) => (
                        <code key={c} style={{ textAlign: 'center' }}>
                          {c}
                        </code>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="pv-stack">
                {codeInput('Current 2FA code', handleGetBackupCodes, 'View backup codes', 'pv-btn--secondary')}
                <div>
                  <button
                    type="button"
                    className="pv-btn pv-btn--danger-soft"
                    onClick={handleDisable}
                    disabled={loading || code.length !== CODE_LENGTH}
                  >
                    Disable 2FA
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
