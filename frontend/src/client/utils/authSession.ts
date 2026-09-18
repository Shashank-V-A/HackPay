import { migrateLocalKey } from './hackPayStorage'

export type AppRole = 'participant' | 'sponsor' | 'organizer'

const SESSION_KEY = 'hack_pay_active_session'
const MANUAL_CONNECT_KEY = 'hack_pay_manual_connect_required'
const ID_TOKEN_KEY = 'hack_pay_cognito_id_token'

if (typeof window !== 'undefined') {
  migrateLocalKey('prize_vault_active_session', SESSION_KEY)
  migrateLocalKey('twin_lock_active_session', SESSION_KEY)
  migrateLocalKey('prize_vault_manual_connect_required', MANUAL_CONNECT_KEY)
  migrateLocalKey('twin_lock_manual_connect_required', MANUAL_CONNECT_KEY)
}

interface ActiveSession {
  wallet: string
  role: AppRole
  updatedAt: string
  /** Cognito subject when signed in via AWS Cognito */
  sub?: string
  authProvider?: 'cognito' | 'local'
}

export function setActiveSession(
  wallet: string,
  role: AppRole,
  extras?: { sub?: string; authProvider?: 'cognito' | 'local'; idToken?: string },
): void {
  try {
    const data: ActiveSession = {
      wallet: wallet.trim(),
      role,
      updatedAt: new Date().toISOString(),
      sub: extras?.sub,
      authProvider: extras?.authProvider || 'local',
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
    if (extras?.idToken) {
      localStorage.setItem(ID_TOKEN_KEY, extras.idToken)
    }
  } catch (_) {
    // ignore
  }
}

export function getActiveSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.wallet || !parsed?.role) return null
    return parsed as ActiveSession
  } catch (_) {
    return null
  }
}

export function getIdToken(): string | null {
  try {
    return localStorage.getItem(ID_TOKEN_KEY)
  } catch (_) {
    return null
  }
}

export function clearActiveSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(ID_TOKEN_KEY)
  } catch (_) {
    // ignore
  }
}

export function requireManualConnect(): void {
  try {
    localStorage.setItem(MANUAL_CONNECT_KEY, '1')
  } catch (_) {
    // ignore
  }
}

export function clearManualConnectRequirement(): void {
  try {
    localStorage.removeItem(MANUAL_CONNECT_KEY)
  } catch (_) {
    // ignore
  }
}

export function isManualConnectRequired(): boolean {
  try {
    return localStorage.getItem(MANUAL_CONNECT_KEY) === '1'
  } catch (_) {
    return false
  }
}

export function hasRequiredRole(required: AppRole): boolean {
  const session = getActiveSession()
  return !!session && session.role === required
}

/** Authorization header for API calls when Cognito ID token is present. */
export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getIdToken()
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
