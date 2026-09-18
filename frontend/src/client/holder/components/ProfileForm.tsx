import React, { useState } from 'react'
import Icon from '../../components/Icon'
import { UserProfile, UserRole } from '../../types/holder'
import { isValidEmail } from '../../constants/escrow'
import { isBrowserCognitoEnabled } from '@/lib/aws/cognitoClient'

interface ProfileFormProps {
  onSubmit: (profile: UserProfile) => void
  /** Role chosen on the gate tabs — still stored on the profile. */
  role: Exclude<UserRole, null>
}

export default function ProfileForm({ onSubmit, role }: ProfileFormProps) {
  const cognito = isBrowserCognitoEnabled()
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [college, setCollege] = useState('')
  const [usn, setUsn] = useState('')
  const [upi, setUpi] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const nameError = authMode === 'signup' && !name.trim() ? 'Enter your name.' : ''
  const emailError = !isValidEmail(email) ? 'Enter a valid email.' : ''
  const passwordError = !cognito
    ? ''
    : password.length < 8
      ? 'Password must be at least 8 characters.'
      : !/[a-z]/.test(password) || !/[0-9]/.test(password)
        ? 'Include a lowercase letter and a number (e.g. hackpay1).'
        : ''

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (emailError || passwordError) return
    if (authMode === 'signup' && nameError) return
    onSubmit({
      name: name.trim() || email.trim().split('@')[0],
      email: email.trim().toLowerCase(),
      college: college.trim() || undefined,
      usn: usn.trim() || undefined,
      upi: upi.trim() || undefined,
      role,
      password: cognito ? password : undefined,
      authMode: cognito ? authMode : undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="pv-form-stack" noValidate>
      {cognito ? (
        <div className="pv-field">
          <div className="pv-gate__tabs" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              role="tab"
              className={`pv-gate__tab${authMode === 'signup' ? ' is-active' : ''}`}
              aria-selected={authMode === 'signup'}
              onClick={() => setAuthMode('signup')}
            >
              Create account
            </button>
            <button
              type="button"
              role="tab"
              className={`pv-gate__tab${authMode === 'signin' ? ' is-active' : ''}`}
              aria-selected={authMode === 'signin'}
              onClick={() => setAuthMode('signin')}
            >
              Sign in
            </button>
          </div>
          <p className="pv-dim" style={{ marginTop: 8, fontSize: 13 }}>
            Secured with Amazon Cognito
          </p>
        </div>
      ) : null}

      {authMode === 'signup' ? (
        <div className="pv-field">
          <label className="pv-field__label" htmlFor="profile-name">
            Name <span className="pv-field__required">*</span>
          </label>
          <div className="pv-gate__field">
            <span className="pv-gate__field-icon" aria-hidden>
              <Icon name="users" size={15} />
            </span>
            <input
              id="profile-name"
              type="text"
              className="pv-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              maxLength={120}
              aria-invalid={submitted && nameError ? 'true' : undefined}
              aria-describedby={submitted && nameError ? 'err-profile-name' : undefined}
            />
          </div>
          {submitted && nameError ? (
            <span className="pv-field__error" id="err-profile-name" role="alert">
              <Icon name="alert" size={12} />
              {nameError}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="pv-field">
        <label className="pv-field__label" htmlFor="profile-email">
          Email <span className="pv-field__required">*</span>
        </label>
        <div className="pv-gate__field">
          <span className="pv-gate__field-icon" aria-hidden>
            <Icon name="file" size={15} />
          </span>
          <input
            id="profile-email"
            type="email"
            className="pv-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@college.edu"
            autoComplete="email"
            maxLength={120}
            aria-invalid={submitted && emailError ? 'true' : undefined}
            aria-describedby={submitted && emailError ? 'err-profile-email' : undefined}
          />
        </div>
        {submitted && emailError ? (
          <span className="pv-field__error" id="err-profile-email" role="alert">
            <Icon name="alert" size={12} />
            {emailError}
          </span>
        ) : null}
      </div>

      {cognito ? (
        <div className="pv-field">
          <label className="pv-field__label" htmlFor="profile-password">
            Password <span className="pv-field__required">*</span>
          </label>
          <div className="pv-gate__field">
            <span className="pv-gate__field-icon" aria-hidden>
              <Icon name="file" size={15} />
            </span>
            <input
              id="profile-password"
              type="password"
              className="pv-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="e.g. hackpay1 (letter + number)"
              autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              maxLength={128}
              aria-invalid={submitted && passwordError ? 'true' : undefined}
            />
          </div>
          {submitted && passwordError ? (
            <span className="pv-field__error" role="alert">
              <Icon name="alert" size={12} />
              {passwordError}
            </span>
          ) : (
            <p className="pv-dim" style={{ marginTop: 6, fontSize: 12 }}>
              Cognito needs 8+ chars with a lowercase letter and a number.
            </p>
          )}
        </div>
      ) : null}

      {authMode === 'signup' ? (
        <div className="pv-form-grid">
          <div className="pv-field">
            <label className="pv-field__label" htmlFor="profile-college">
              College or organization
            </label>
            <div className="pv-gate__field">
              <span className="pv-gate__field-icon" aria-hidden>
                <Icon name="grid" size={15} />
              </span>
              <input
                id="profile-college"
                type="text"
                className="pv-input"
                value={college}
                onChange={(e) => setCollege(e.target.value)}
                placeholder="Optional"
                autoComplete="organization"
                maxLength={120}
              />
            </div>
          </div>
          <div className="pv-field">
            <label className="pv-field__label" htmlFor="profile-usn">
              USN
            </label>
            <div className="pv-gate__field">
              <span className="pv-gate__field-icon" aria-hidden>
                <Icon name="file" size={15} />
              </span>
              <input
                id="profile-usn"
                type="text"
                className="pv-input"
                value={usn}
                onChange={(e) => setUsn(e.target.value)}
                placeholder="Optional"
                autoComplete="off"
                maxLength={40}
              />
            </div>
          </div>
        </div>
      ) : null}

      {role === 'participant' && authMode === 'signup' ? (
        <div className="pv-field">
          <label className="pv-field__label" htmlFor="profile-upi">
            UPI ID for prizes
          </label>
          <div className="pv-gate__field">
            <span className="pv-gate__field-icon" aria-hidden>
              <Icon name="send" size={15} />
            </span>
            <input
              id="profile-upi"
              type="text"
              className="pv-input"
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
              placeholder="name@okaxis"
              autoComplete="off"
              maxLength={80}
            />
          </div>
        </div>
      ) : null}

      <button type="submit" className="pv-btn pv-btn--primary pv-btn--lg pv-btn--block">
        {cognito ? (authMode === 'signin' ? 'Sign in with Cognito' : 'Create Cognito account') : 'Continue'}
        <Icon name="arrowRight" size={15} />
      </button>
    </form>
  )
}
