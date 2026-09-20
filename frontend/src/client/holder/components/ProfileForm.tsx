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
    <form onSubmit={handleSubmit} className="pv-form-stack pv-gate__form" noValidate>
      {cognito ? (
        <p className="pv-gate__mode">
          {authMode === 'signup' ? (
            <>
              Creating a new account.{' '}
              <button type="button" className="pv-gate__mode-link" onClick={() => setAuthMode('signin')}>
                Sign in instead
              </button>
            </>
          ) : (
            <>
              Welcome back.{' '}
              <button type="button" className="pv-gate__mode-link" onClick={() => setAuthMode('signup')}>
                Create an account
              </button>
            </>
          )}
        </p>
      ) : null}

      {authMode === 'signup' ? (
        <div className="pv-field">
          <label className="pv-field__label" htmlFor="profile-name">
            Name <span className="pv-field__required">*</span>
          </label>
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
          <input
            id="profile-password"
            type="password"
            className="pv-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
            maxLength={128}
            aria-invalid={submitted && passwordError ? 'true' : undefined}
          />
          {submitted && passwordError ? (
            <span className="pv-field__error" role="alert">
              <Icon name="alert" size={12} />
              {passwordError}
            </span>
          ) : (
            <p className="pv-gate__hint">8+ characters, with a lowercase letter and a number.</p>
          )}
        </div>
      ) : null}

      {authMode === 'signup' ? (
        <div className="pv-form-grid">
          <div className="pv-field">
            <label className="pv-field__label" htmlFor="profile-college">
              College <span className="pv-gate__optional">optional</span>
            </label>
            <input
              id="profile-college"
              type="text"
              className="pv-input"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              placeholder="Your college"
              autoComplete="organization"
              maxLength={120}
            />
          </div>
          <div className="pv-field">
            <label className="pv-field__label" htmlFor="profile-usn">
              USN <span className="pv-gate__optional">optional</span>
            </label>
            <input
              id="profile-usn"
              type="text"
              className="pv-input"
              value={usn}
              onChange={(e) => setUsn(e.target.value)}
              placeholder="USN"
              autoComplete="off"
              maxLength={40}
            />
          </div>
        </div>
      ) : null}

      {role === 'participant' && authMode === 'signup' ? (
        <div className="pv-field">
          <label className="pv-field__label" htmlFor="profile-upi">
            UPI for prizes <span className="pv-gate__optional">optional</span>
          </label>
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
      ) : null}

      <button type="submit" className="pv-btn pv-btn--primary pv-btn--lg pv-btn--block">
        {cognito ? (authMode === 'signin' ? 'Sign in' : 'Create account') : 'Continue'}
        <Icon name="arrowRight" size={15} />
      </button>
    </form>
  )
}
