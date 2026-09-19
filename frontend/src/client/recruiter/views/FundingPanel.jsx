import React, { useEffect, useState } from 'react'
import Icon from '../../components/Icon'
import AddressChip from '../../components/AddressChip'
import { formatXlm } from '../../utils/format'

export default function FundingPanel({
  selectedEscrow,
  onFund,
  onConfirmAttributed,
  fundingDestinationAddress,
  displaySenderAddress,
  onSyncOnChain,
  isFunding,
  fundingError,
}) {
  const [amount, setAmount] = useState('')
  const [razorpayLive, setRazorpayLive] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRazorpayLive(Boolean(data?.razorpayConfigured))
      })
      .catch(() => {
        if (!cancelled) setRazorpayLive(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedEscrow) {
      setAmount('')
      return
    }
    if (selectedEscrow.fullyFunded) {
      setAmount('')
      return
    }
    const remaining = Number(selectedEscrow.remainingXlm ?? 0)
    setAmount(remaining > 0 ? String(remaining) : '')
  }, [selectedEscrow?.id, selectedEscrow?.remainingXlm, selectedEscrow?.fullyFunded])

  if (!selectedEscrow) {
    return (
      <section className="pv-card">
        <div className="pv-card__header">
          <div>
            <h3 className="pv-card__title">Fund prize pool</h3>
            <p className="pv-card__subtitle">Pick an escrow to fund it</p>
          </div>
        </div>
        <div className="pv-empty">
          <span className="pv-empty__icon">
            <Icon name="send" size={20} />
          </span>
          <p className="pv-empty__text">
            Select a HackPay vault to lock INR via Razorpay.
          </p>
        </div>
      </section>
    )
  }

  const numeric = Number(amount)
  const canSubmit =
    !isFunding &&
    !selectedEscrow.fullyFunded &&
    amount !== '' &&
    Number.isFinite(numeric) &&
    numeric > 0
  const prizePool = Number(selectedEscrow.prizePool || 0)
  const attributed = Number(selectedEscrow.balanceAlgo || 0)
  const remaining = Number(selectedEscrow.remainingXlm ?? Math.max(0, prizePool - attributed))
  const sharedOnChain = Number(selectedEscrow.sharedOnChainBalance || 0)
  const canConfirmAttributed =
    !isFunding &&
    !selectedEscrow.fullyFunded &&
    prizePool > 0 &&
    sharedOnChain >= prizePool

  return (
    <section className="pv-card">
      <div className="pv-card__header">
        <div>
          <h3 className="pv-card__title">Fund prize pool</h3>
          <p className="pv-card__subtitle">
            {selectedEscrow.name}
            {prizePool > 0
              ? ` · target ₹${formatXlm(prizePool)}${
                  selectedEscrow.fullyFunded
                    ? ' (fully funded)'
                    : remaining > 0
                      ? ` (₹${formatXlm(remaining)} remaining)`
                      : ''
                }`
              : ''}
          </p>
        </div>
        <div className="pv-card__actions">
          <button type="button" className="pv-btn pv-btn--ghost pv-btn--sm" onClick={onSyncOnChain}>
            <Icon name="refresh" size={14} />
            Sync vault
          </button>
        </div>
      </div>

      <div className="pv-card__body">
        <div
          className="pv-responsive-grid"
          style={{ marginBottom: 'var(--pv-space-7)', gap: 'var(--pv-space-5)' }}
        >
          <div className="pv-stat">
            <span className="pv-stat__label">
              <Icon name="lock" size={12} />
              Funded for this event
            </span>
            <span className="pv-stat__value">
              {formatXlm(attributed)}
              <span className="pv-stat__unit">/ ₹{formatXlm(prizePool)}</span>
            </span>
          </div>
          <div className="pv-stat">
            <span className="pv-stat__label">
              <Icon name="wallet" size={12} />
              INR vault balance
            </span>
            <span className="pv-stat__value">
              {formatXlm(sharedOnChain)}
              <span className="pv-stat__unit">INR</span>
            </span>
          </div>
        </div>

        <p className="pv-muted" style={{ marginBottom: 'var(--pv-space-7)', fontSize: 'var(--pv-text-sm)' }}>
          {razorpayLive
            ? 'You pay the prize pool here with Razorpay Checkout. Winners later receive INR to UPI or bank — they never open Checkout.'
            : 'Demo mode: escrow funding is recorded without Razorpay keys (mock order). Add RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in Amplify to open real Checkout.'}
        </p>
        {razorpayLive === false ? (
          <div className="pv-alert" role="status" style={{ marginBottom: 'var(--pv-space-7)' }}>
            <span className="pv-alert__icon">
              <Icon name="alert" size={16} />
            </span>
            <div className="pv-alert__content">
              <p className="pv-alert__title">Razorpay keys not configured</p>
              <p className="pv-alert__text">
                Funding still works for Ship It demos via mock attribution. Live Checkout needs test
                keys from dashboard.razorpay.com.
              </p>
            </div>
          </div>
        ) : null}
        <dl className="pv-dl" style={{ marginBottom: 'var(--pv-space-7)' }}>
          <div className="pv-dl__item">
            <dt className="pv-dl__key">Destination (INR vault)</dt>
            <dd className="pv-dl__val">
              <AddressChip
                address={fundingDestinationAddress}
                label="vault id"
                lead={8}
                tail={8}
              />
            </dd>
          </div>
          <div className="pv-dl__item">
            <dt className="pv-dl__key">Sponsor account</dt>
            <dd className="pv-dl__val">
              <AddressChip address={displaySenderAddress} label="sponsor account" full />
            </dd>
          </div>
        </dl>

        {selectedEscrow.fullyFunded ? (
          <div className="pv-alert pv-alert--success" role="status">
            <span className="pv-alert__icon">
              <Icon name="checkCircle" size={16} />
            </span>
            <div className="pv-alert__content">
              <p className="pv-alert__title">Prize pool fully funded</p>
              <p className="pv-alert__text">
                This event is unlocked for the organizer. A verified badge will show on the home
                page.
              </p>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!canSubmit) return
              onFund({ escrowId: selectedEscrow.id, amount })
            }}
          >
            <div className="pv-field">
              <label className="pv-field__label" htmlFor="fund-amount">
                Amount to send
              </label>
              <div className="pv-input-group">
                <input
                  id="fund-amount"
                  type="number"
                  min="0"
                  step="any"
                  className="pv-input"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isFunding}
                />
                <span className="pv-input-group__affix">INR</span>
              </div>
              <span className="pv-field__hint">
                Test Mode: Mastercard 5267 3181 8797 5449, any future expiry, any CVV, then any
                4-digit OTP (Skip OTP on the bank page can still show this Axis prompt — that is
                Razorpay, not HackPay). Or pick any netbanking bank and click Success. Do not
                use Visa 4111 or scan a UPI QR.
              </span>
            </div>

            <div className="pv-btn-group" style={{ marginTop: 'var(--pv-space-6)' }}>
              <button type="submit" className="pv-btn pv-btn--primary" disabled={!canSubmit}>
                {isFunding ? (
                  <>
                    <span className="pv-btn__spinner" />
                    Opening Checkout
                  </>
                ) : (
                  <>
                    <Icon name="send" size={15} />
                    Pay with Razorpay
                  </>
                )}
              </button>
              {canConfirmAttributed && onConfirmAttributed ? (
                <button
                  type="button"
                  className="pv-btn pv-btn--secondary"
                  disabled={isFunding}
                  onClick={() => onConfirmAttributed(selectedEscrow.id)}
                >
                  <Icon name="check" size={15} />
                  Attribute existing escrow funds
                </button>
              ) : null}
            </div>
            {canConfirmAttributed ? (
              <p className="pv-field__hint" style={{ marginTop: 'var(--pv-space-4)' }}>
                Already funded? Attribute ₹{formatXlm(prizePool)} to this event without another transfer.
              </p>
            ) : null}
          </form>
        )}

        {fundingError ? (
          <div
            className="pv-alert pv-alert--danger"
            role="alert"
            aria-live="assertive"
            style={{ marginTop: 'var(--pv-space-7)' }}
          >
            <span className="pv-alert__icon">
              <Icon name="alert" size={16} />
            </span>
            <div className="pv-alert__content">
              <p className="pv-alert__title">Funding failed</p>
              <p className="pv-alert__text" style={{ overflowWrap: 'anywhere' }}>
                {fundingError}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
