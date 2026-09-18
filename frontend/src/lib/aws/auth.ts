import { CognitoJwtVerifier } from 'aws-jwt-verify'
import type { AppRole } from '@/client/utils/authSession'
import {
  getCognitoClientId,
  getCognitoUserPoolId,
  isCognitoConfigured,
} from '@/lib/aws/env'

export type AuthUser = {
  sub: string
  email: string
  role: AppRole
  name?: string
  tokenUse: string
}

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null

function getVerifier() {
  if (!isCognitoConfigured()) return null
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: getCognitoUserPoolId(),
      tokenUse: 'id',
      clientId: getCognitoClientId(),
    })
  }
  return verifier
}

function parseRole(value: unknown): AppRole | null {
  if (value === 'organizer' || value === 'sponsor' || value === 'participant') return value
  return null
}

/**
 * Verify Cognito ID token from Authorization: Bearer … header.
 * Returns null when Cognito is not configured (local demo mode).
 */
export async function verifyRequestAuth(request: Request): Promise<AuthUser | null> {
  if (!isCognitoConfigured()) return null

  const header = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!header?.toLowerCase().startsWith('bearer ')) {
    throw new AuthError('Missing Bearer token', 401)
  }

  const token = header.slice(7).trim()
  if (!token) throw new AuthError('Missing Bearer token', 401)

  const v = getVerifier()
  if (!v) throw new AuthError('Cognito verifier unavailable', 500)

  try {
    const payload = await v.verify(token)
    const email = String(payload.email || payload['cognito:username'] || '').toLowerCase()
    const role =
      parseRole(payload['custom:role']) ||
      parseRole((payload as Record<string, unknown>).role) ||
      'participant'
    if (!email) throw new AuthError('Token missing email', 401)
    return {
      sub: String(payload.sub),
      email,
      role,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      tokenUse: String(payload.token_use || 'id'),
    }
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError('Invalid or expired token', 401)
  }
}

/**
 * When Cognito is enabled, require a valid JWT.
 * When disabled, return null (callers may trust body for local demo).
 */
export async function requireAuthIfConfigured(request: Request): Promise<AuthUser | null> {
  if (!isCognitoConfigured()) return null
  return verifyRequestAuth(request)
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

/** Shared secret for EventBridge → Lambda → /api/agent/tick */
export function verifyAgentCronSecret(request: Request): boolean {
  const expected = process.env.AGENT_CRON_SECRET?.trim()
  if (!expected) return true // open when unset (local)
  const got =
    request.headers.get('x-agent-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return Boolean(got && got === expected)
}
