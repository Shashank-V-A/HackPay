import React, { useEffect, useState } from 'react'
import AddressChip from '../../components/AddressChip'

export default function SponsorProfilePanel({ sponsorName, defaultWallet }) {
  const [networkLabel, setNetworkLabel] = useState('Razorpay INR')

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.razorpayConfigured) {
          setNetworkLabel(data.razorpayTestMode ? 'Razorpay INR (test keys)' : 'Razorpay INR (live)')
        } else {
          setNetworkLabel('Razorpay INR (demo mock — no keys)')
        }
      })
      .catch(() => {
        if (!cancelled) setNetworkLabel('Razorpay INR (demo mock)')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="pv-card">
      <div className="pv-card__header">
        <div>
          <h3 className="pv-card__title">Sponsor profile</h3>
          <p className="pv-card__subtitle">Identity and vault account</p>
        </div>
      </div>
      <div className="pv-card__body pv-card__body--tight">
        <div className="pv-kv-row">
          <span className="pv-kv-row__key">Organization</span>
          <span className="pv-kv-row__val">{sponsorName}</span>
        </div>
        <div className="pv-kv-row">
          <span className="pv-kv-row__key">Account</span>
          <span className="pv-kv-row__val">
            <AddressChip address={defaultWallet} label="sponsor account" full />
          </span>
        </div>
        <div className="pv-kv-row">
          <span className="pv-kv-row__key">Network</span>
          <span className="pv-kv-row__val">{networkLabel}</span>
        </div>
      </div>
    </section>
  )
}
