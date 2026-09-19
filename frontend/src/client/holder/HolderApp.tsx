import { Suspense, lazy, useEffect, useState } from 'react'
import SharedHeader from '../components/SharedHeader'
import { detectUserRole } from './utils/roleDetection'
import { getProfileForWallet, setProfileForWallet } from './utils/userProfileStorage'
import { UserProfile, UserRole } from '../types/holder'
import {
  clearActiveSession,
  getActiveSession,
  requireManualConnect,
  setActiveSession,
  type AppRole,
} from '../utils/authSession'
import { resolveSessionWithQrBootstrap } from '../utils/qrSession'
import { disconnectWallet } from '../wallet'
import { syncWalletSession } from '../services/sessionApi'
import WalletGate from './components/WalletGate'
import {
  cognitoSignIn,
  cognitoSignOut,
  cognitoSignUp,
  isBrowserCognitoEnabled,
} from '@/lib/aws/cognitoClient'

const ConnectedHolderView = lazy(() => import('./ConnectedHolderView'))

function parseRoleParam(value: string | null): AppRole | null {
  if (value === 'organizer' || value === 'sponsor' || value === 'participant') return value
  return null
}

export type HolderView = 'list' | 'sponsor' | 'participant' | 'organizer' | 'event'

function Loading({ label }: { label: string }) {
  return (
    <div className="pv-card">
      <div className="pv-empty">
        <span className="pv-btn__spinner" style={{ width: 20, height: 20 }} />
        <p className="pv-empty__text">{label}</p>
      </div>
    </div>
  )
}

export default function HolderApp() {
  const [walletConnected, setWalletConnected] = useState(false)
  const [userWallet, setUserWallet] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [activeView, setActiveView] = useState<HolderView>('list')
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [loginStep, setLoginStep] = useState<'profile' | 'connect'>('profile')
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null)
  const [connectError, setConnectError] = useState('')
  const [gateRole, setGateRole] = useState<AppRole>('participant')
  const [authBusy, setAuthBusy] = useState(false)

  useEffect(() => {
    const session = resolveSessionWithQrBootstrap() || getActiveSession()
    if (!session) return

    setUserWallet(session.wallet)
    setUserRole(session.role)
    setWalletConnected(true)
    if (session.role) {
      void syncWalletSession({
        wallet: session.wallet,
        role: session.role,
        name: getProfileForWallet(session.wallet)?.name,
      })
    }

    if (session.role === 'participant') {
      setActiveView('participant')
      return
    }
    if (session.role === 'sponsor') {
      window.location.href = '/verifier'
      return
    }
    if (session.role === 'organizer') {
      window.location.href = '/issuer'
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const role = parseRoleParam(params.get('role'))
    if (role) setGateRole(role)
    const eventId = params.get('event')
    if (!eventId) return
    setActiveEventId(eventId)
    setActiveView('event')
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
  }, [])

  const handleWalletConnect = (
    address: string,
    profileOverride?: UserProfile | null,
    cognitoExtras?: { idToken: string; sub?: string },
  ) => {
    setUserWallet(address)
    setWalletConnected(true)
    let role: UserRole
    let profileName: string | undefined
    const pending = profileOverride || pendingProfile
    if (pending) {
      setProfileForWallet(address, pending)
      role = pending.role
      profileName = pending.name
      setUserRole(role)
      setPendingProfile(null)
    } else {
      const saved = getProfileForWallet(address)
      if (saved) {
        role = saved.role
        profileName = saved.name
        setUserRole(role)
      } else {
        role = detectUserRole(address)
        setUserRole(role)
      }
    }
    if (role) {
      setActiveSession(address, role, {
        authProvider: cognitoExtras ? 'cognito' : 'local',
        idToken: cognitoExtras?.idToken,
        sub: cognitoExtras?.sub,
      })
      void syncWalletSession({ wallet: address, role, name: profileName })
    }
    if (role === 'sponsor') {
      window.location.href = '/verifier'
      return
    }
    if (role === 'organizer') {
      window.location.href = '/issuer'
      return
    }
    if (role === 'participant') {
      setActiveView('participant')
    }
  }

  const handleCognitoProfile = async (profile: UserProfile) => {
    setAuthBusy(true)
    setConnectError('')
    setPendingProfile(profile)
    setGateRole(profile.role as AppRole)
    try {
      const password = profile.password || ''
      const email = profile.email.trim().toLowerCase()
      const role = profile.role as AppRole

      if (profile.authMode === 'signin') {
        const result = await cognitoSignIn({ email, password, role })
        handleWalletConnect(
          result.email,
          { ...profile, name: result.name || profile.name },
          { idToken: result.idToken },
        )
        return
      }

      try {
        await cognitoSignUp({
          email,
          password,
          name: profile.name,
          role,
        })
      } catch (signUpErr) {
        const msg =
          signUpErr instanceof Error ? signUpErr.message : String(signUpErr || '')
        // Account already exists — try signing in with the same credentials.
        if (/already exists/i.test(msg)) {
          try {
            const existing = await cognitoSignIn({ email, password, role })
            handleWalletConnect(
              existing.email,
              { ...profile, name: existing.name || profile.name },
              { idToken: existing.idToken },
            )
            return
          } catch {
            throw new Error(
              'An account with this email already exists. Switch to Sign in and use your password (or reset it).',
            )
          }
        }
        throw signUpErr
      }

      const result = await cognitoSignIn({ email, password, role })
      handleWalletConnect(result.email, profile, { idToken: result.idToken })
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Cognito sign-in failed'
      setConnectError(message)
    } finally {
      setAuthBusy(false)
    }
  }

  useEffect(() => {
    if (!walletConnected || !userRole) return
    if (userRole === 'sponsor') {
      window.location.href = '/verifier'
      return
    }
    if (userRole === 'organizer') {
      window.location.href = '/issuer'
    }
  }, [walletConnected, userRole])

  const handleNavigate = (view: string, params?: { hackathonId?: string } | unknown) => {
    const hackathonId =
      params && typeof params === 'object' && 'hackathonId' in params
        ? String((params as { hackathonId?: string }).hackathonId ?? '')
        : ''

    if (hackathonId) setActiveEventId(hackathonId)

    if (view === 'event') setActiveView('event')
    else if (view === 'sponsor') setActiveView('sponsor')
    else if (view === 'participant') setActiveView('participant')
    else if (view === 'organizer') setActiveView('organizer')
    else setActiveView('list')
  }

  const handleDisconnect = () => {
    void disconnectWallet()
    if (userWallet) cognitoSignOut(userWallet)
    clearActiveSession()
    requireManualConnect()
    setWalletConnected(false)
    setUserWallet(null)
    setUserRole(null)
    setActiveView('list')
    setActiveEventId(null)
    setLoginStep('profile')
    setPendingProfile(null)
    setConnectError('')
  }

  const handleGateRoleChange = (next: AppRole) => {
    setGateRole(next)
    setPendingProfile((current) => (current ? { ...current, role: next } : current))
  }

  if (!walletConnected) {
    return (
      <WalletGate
        role={gateRole}
        onRoleChange={handleGateRoleChange}
        loginStep={loginStep}
        connectError={connectError || (authBusy ? 'Signing in with Amazon Cognito…' : '')}
        onProfileSubmit={(profile) => {
          if (isBrowserCognitoEnabled()) {
            void handleCognitoProfile(profile)
            return
          }
          setPendingProfile(profile)
          setGateRole(profile.role as AppRole)
          setConnectError('')
          handleWalletConnect(profile.email.trim().toLowerCase(), profile)
        }}
        onBackToProfile={() => setLoginStep('profile')}
        connectSlot={null}
      />
    )
  }

  return (
    <div className="pv-shell pv-app">
      <a className="pv-skip-link" href="#wallet">
        Skip to content
      </a>

      <SharedHeader activeTab="holder" subtitle="Participant" />

      <main className="pv-container pv-container--wide" id="wallet">
        {userWallet ? (
          <div style={{ padding: 'var(--pv-space-8) 0 var(--pv-space-13)' }}>
            <Suspense fallback={<Loading label="Loading your dashboard..." />}>
              <ConnectedHolderView
                userWallet={userWallet}
                userRole={userRole}
                activeView={activeView}
                activeEventId={activeEventId}
                setActiveView={setActiveView}
                onDisconnect={handleDisconnect}
                onNavigate={handleNavigate}
              />
            </Suspense>
          </div>
        ) : null}
      </main>

      <footer className="pv-footer">
        <div className="pv-footer__inner">
          <span>HackPay · hackathon prize escrow powered by Razorpay INR dual-control.</span>
          <span className="pv-dim">
            2-of-2 approvals · Agentic gates · AWS Cognito · Receipt audit trail
          </span>
        </div>
      </footer>
    </div>
  )
}
