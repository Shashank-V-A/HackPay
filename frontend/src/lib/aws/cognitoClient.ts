/**
 * Browser Cognito helpers (SRP sign-up / sign-in).
 * Falls back to null when pool env vars are unset (local email demo).
 */
'use client'

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js'
import type { AppRole } from '@/client/utils/authSession'

function poolConfig() {
  const UserPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim() || ''
  const ClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim() || ''
  if (!UserPoolId || !ClientId) return null
  return { UserPoolId, ClientId }
}

export function isBrowserCognitoEnabled(): boolean {
  return Boolean(poolConfig())
}

function getUserPool(): CognitoUserPool {
  const cfg = poolConfig()
  if (!cfg) throw new Error('Cognito is not configured')
  return new CognitoUserPool(cfg)
}

export type CognitoAuthResult = {
  email: string
  role: AppRole
  name?: string
  idToken: string
  accessToken: string
  refreshToken: string
}

function sessionToResult(session: CognitoUserSession, fallbackRole: AppRole): CognitoAuthResult {
  const idToken = session.getIdToken()
  const payload = idToken.decodePayload() as Record<string, string>
  const email = String(payload.email || payload['cognito:username'] || '').toLowerCase()
  const role = (payload['custom:role'] as AppRole) || fallbackRole
  return {
    email,
    role,
    name: payload.name,
    idToken: idToken.getJwtToken(),
    accessToken: session.getAccessToken().getJwtToken(),
    refreshToken: session.getRefreshToken().getToken(),
  }
}

export function cognitoSignUp(input: {
  email: string
  password: string
  name: string
  role: AppRole
}): Promise<{ userConfirmed: boolean; userSub?: string }> {
  const pool = getUserPool()
  const attributeList = [
    new CognitoUserAttribute({ Name: 'email', Value: input.email.trim().toLowerCase() }),
    new CognitoUserAttribute({ Name: 'name', Value: input.name.trim() }),
    new CognitoUserAttribute({ Name: 'custom:role', Value: input.role }),
  ]

  return new Promise((resolve, reject) => {
    pool.signUp(
      input.email.trim().toLowerCase(),
      input.password,
      attributeList,
      [],
      (err, result) => {
        if (err) {
          reject(err)
          return
        }
        resolve({
          userConfirmed: Boolean(result?.userConfirmed),
          userSub: result?.userSub,
        })
      },
    )
  })
}

export function cognitoConfirmSignUp(email: string, code: string): Promise<void> {
  const user = new CognitoUser({
    Username: email.trim().toLowerCase(),
    Pool: getUserPool(),
  })
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export function cognitoSignIn(input: {
  email: string
  password: string
  role: AppRole
}): Promise<CognitoAuthResult> {
  const user = new CognitoUser({
    Username: input.email.trim().toLowerCase(),
    Pool: getUserPool(),
  })
  const authDetails = new AuthenticationDetails({
    Username: input.email.trim().toLowerCase(),
    Password: input.password,
  })

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        // Persist role attribute if missing on older users
        const attrs = [
          new CognitoUserAttribute({ Name: 'custom:role', Value: input.role }),
        ]
        user.updateAttributes(attrs, () => {
          resolve(sessionToResult(session, input.role))
        })
      },
      onFailure: (err) => reject(err),
    })
  })
}

export function cognitoSignOut(email?: string): void {
  try {
    const pool = getUserPool()
    const current = pool.getCurrentUser()
    if (current) {
      current.signOut()
      return
    }
    if (email) {
      new CognitoUser({ Username: email, Pool: pool }).signOut()
    }
  } catch {
    // ignore
  }
}

export function cognitoGetSession(): Promise<CognitoAuthResult | null> {
  if (!isBrowserCognitoEnabled()) return Promise.resolve(null)
  const pool = getUserPool()
  const user = pool.getCurrentUser()
  if (!user) return Promise.resolve(null)

  return new Promise((resolve) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        resolve(null)
        return
      }
      resolve(sessionToResult(session, 'participant'))
    })
  })
}
