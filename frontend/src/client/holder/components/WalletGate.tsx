'use client'

import type { ReactNode } from 'react'
import Icon from '../../components/Icon'
import ProfileForm from './ProfileForm'
import type { UserProfile } from '../../types/holder'
import type { AppRole } from '../../utils/authSession'

const ROLES: {
  id: AppRole
  label: string
  headline: string
  blurb: string
}[] = [
  {
    id: 'participant',
    label: 'Participant',
    headline: 'Join an event',
    blurb: 'Register, track prizes, and get paid in INR.',
  },
  {
    id: 'organizer',
    label: 'Organizer',
    headline: 'Run your hackathon',
    blurb: 'Create events, pick winners, propose payouts.',
  },
  {
    id: 'sponsor',
    label: 'Sponsor',
    headline: 'Lock the prize pool',
    blurb: 'Fund escrow. Nothing leaves until you co-approve.',
  },
]

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
      <div className="pv-gate__atmosphere" aria-hidden="true">
        <span className="pv-gate__orb pv-gate__orb--a" />
        <span className="pv-gate__orb pv-gate__orb--b" />
        <span className="pv-gate__grid" />
      </div>

      <a className="pv-skip-link" href="#gate-form">
        Skip to sign in
      </a>

      <header className="pv-gate__top">
        <a href="/" className="pv-gate__brand">
          <span className="pv-gate__brand-mark" aria-hidden>
            <Icon name="lock" size={14} />
          </span>
          HackPay
        </a>
      </header>

      <div className="pv-gate__stage">
        <div className={`pv-gate__sheet ${loginStep === 'connect' ? 'is-connect' : ''}`.trim()}>
          <div className="pv-gate__intro">
            <p className="pv-gate__kicker">Dual-control INR escrow</p>
            <h1 key={copy.headline} className="pv-gate__headline">
              {loginStep === 'profile' ? copy.headline : 'Confirm your account'}
            </h1>
            <p key={copy.blurb} className="pv-gate__lede">
              {loginStep === 'profile'
                ? copy.blurb
                : 'Use the email you control to finish signing in.'}
            </p>
          </div>

          <div className="pv-gate__panel" id="gate-form">
            {loginStep === 'profile' ? (
              <div className="pv-gate__roles" role="tablist" aria-label="Sign in as">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="tab"
                    aria-selected={role === r.id}
                    className={`pv-gate__role ${role === r.id ? 'is-active' : ''}`.trim()}
                    onClick={() => onRoleChange(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div key={loginStep} className="pv-gate__step">
              {connectError && loginStep === 'profile' ? (
                <div className="pv-gate__alert" role="alert">
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
                    Back
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
          </div>
        </div>

        <p className="pv-gate__disclaimer">
          Neither sponsor nor organizer can move prize funds alone.
        </p>
      </div>
    </div>
  )
}
