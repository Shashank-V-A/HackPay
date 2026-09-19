'use client'

import type { ReactNode } from 'react'
import Icon from '../../components/Icon'
import ProfileForm from './ProfileForm'
import type { UserProfile } from '../../types/holder'
import type { AppRole } from '../../utils/authSession'

const ROLES: {
  id: AppRole
  label: string
  hello: string
  blurb: string
  title: string
}[] = [
  {
    id: 'participant',
    label: 'Participant',
    hello: 'HELLO, FRIEND!',
    blurb: 'Enter your details to compete and receive prizes in INR.',
    title: 'Sign in as Participant',
  },
  {
    id: 'organizer',
    label: 'Organizer',
    hello: 'HELLO, ORGANIZER!',
    blurb: 'Run events and propose payouts. You never hold prize money alone.',
    title: 'Sign in as Organizer',
  },
  {
    id: 'sponsor',
    label: 'Sponsor',
    hello: 'HELLO, SPONSOR!',
    blurb: 'Lock the prize pool. Nothing leaves escrow until you co-approve.',
    title: 'Sign in as Sponsor',
  },
]

function VaultKey({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 120" fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="24" cy="22" r="13" />
        <circle cx="24" cy="22" r="5.5" />
        <path d="M24 35.5V108" />
        <path d="M24 76h16M24 88h12M24 100h18" />
      </g>
    </svg>
  )
}

export interface WalletGateProps {
  role: AppRole
  onRoleChange: (role: AppRole) => void
  loginStep: 'profile' | 'connect'
  connectError: string
  onProfileSubmit: (profile: UserProfile) => void
  onBackToProfile: () => void
  connectSlot: ReactNode
}

export default function WalletGate({
  role,
  onRoleChange,
  loginStep,
  connectError,
  onProfileSubmit,
  onBackToProfile,
  connectSlot,
}: WalletGateProps) {
  const copy = ROLES.find((r) => r.id === role) || ROLES[0]

  return (
    <div className="pv-gate">
      <div className="pv-gate__vault" aria-hidden="true">
        <div className="pv-gate__vault-floor" />
        <svg className="pv-gate__vault-door" viewBox="0 0 400 400">
          <circle cx="200" cy="200" r="188" fill="none" stroke="#06101f" strokeWidth="16" />
          <path
            d="M200 14 A186 186 0 0 0 200 386"
            fill="none"
            stroke="#2f9e4f"
            strokeWidth="11"
            strokeLinecap="round"
          />
          <path
            d="M200 14 A186 186 0 0 1 200 386"
            fill="none"
            stroke="#1f6feb"
            strokeWidth="11"
            strokeLinecap="round"
          />
          <circle cx="200" cy="200" r="164" fill="none" stroke="#06101f" strokeWidth="3" />
          <circle
            className="pv-gate__vault-ticks"
            cx="200"
            cy="200"
            r="148"
            fill="none"
            stroke="#06101f"
            strokeWidth="7"
            strokeDasharray="5 19"
          />
          <circle cx="200" cy="200" r="126" fill="none" stroke="#2f9e4f" strokeWidth="3.5" />
          <circle cx="200" cy="200" r="108" fill="none" stroke="#1f6feb" strokeWidth="3.5" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2 - Math.PI / 2
            return (
              <circle
                key={i}
                cx={200 + Math.cos(a) * 188}
                cy={200 + Math.sin(a) * 188}
                r="6"
                fill={i % 2 === 0 ? '#2f9e4f' : '#1f6feb'}
                stroke="#06101f"
                strokeWidth="1.5"
              />
            )
          })}
        </svg>
        <div className="pv-gate__seal pv-gate__seal--sponsor">
          <VaultKey />
        </div>
        <div className="pv-gate__seal pv-gate__seal--organizer">
          <VaultKey />
        </div>
      </div>

      <a className="pv-skip-link" href="#gate-form">
        Skip to sign in
      </a>

      <a href="/" className="pv-gate__brand">
        <span className="pv-gate__brand-mark" aria-hidden>
          <Icon name="lock" size={14} />
        </span>
        HackPay
      </a>

      <div className="pv-gate__stage">
        <div className={`pv-gate__card ${loginStep === 'connect' ? 'is-connect' : ''}`.trim()}>
          <section className="pv-gate__hello">
            <p className="pv-gate__kicker">HackPay · dual-control INR</p>
            <h2 key={copy.hello} className="pv-gate__hello-title">
              {copy.hello}
            </h2>
            <p key={copy.blurb} className="pv-gate__hello-text">
              {copy.blurb}
            </p>
          </section>

          <section className="pv-gate__panel" id="gate-form">
            <h1 className="pv-gate__title">
              {loginStep === 'profile' ? copy.title : 'Confirm your account'}
            </h1>
            <p className="pv-gate__subtitle">
              {loginStep === 'profile'
                ? 'Step 1 of 1 — this decides which console you land in.'
                : 'Confirm the email you control.'}
            </p>

            <div className="pv-gate__tabs" role="tablist" aria-label="Sign in as">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={role === r.id}
                  className={`pv-gate__tab ${role === r.id ? 'is-active' : ''}`.trim()}
                  onClick={() => onRoleChange(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div key={loginStep} className="pv-gate__step">
              {connectError && loginStep === 'profile' ? (
                <div className="pv-gate__alert" role="alert" style={{ marginBottom: 12 }}>
                  <Icon name="alert" size={16} />
                  <p>{connectError}</p>
                </div>
              ) : null}

              {loginStep === 'profile' ? (
                <ProfileForm role={role} onSubmit={onProfileSubmit} />
              ) : (
                <div className="pv-gate__connect">
                  <button type="button" className="pv-gate__back" onClick={onBackToProfile}>
                    <Icon name="chevronRight" size={14} />
                    Back to details
                  </button>

                  {connectError ? (
                    <div className="pv-gate__alert" role="alert">
                      <Icon name="alert" size={16} />
                      <p>{connectError}</p>
                    </div>
                  ) : null}

                  {connectSlot}
                </div>
              )}
            </div>
          </section>
        </div>

        <p className="pv-gate__disclaimer">
          Prizes are held in a dual-control INR vault. Neither sponsor nor organizer can move funds alone.
        </p>
      </div>
    </div>
  )
}
