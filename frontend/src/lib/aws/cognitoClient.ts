/**
 * Browser Cognito helpers.
 * Uses USER_PASSWORD_AUTH (same as Amplify/CLI) instead of SRP —
 * more reliable for email-as-username pools and clearer errors.
 */
'use client'

import type { AppRole } from '@/client/utils/authSession'

function poolConfig() {
  const UserPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim() || ''
  const ClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim() || ''
  const Region =
    process.env.NEXT_PUBLIC_AWS_REGION?.trim() ||
    (UserPoolId.includes('_') ? UserPoolId.split('_')[0] : '') ||
    'ap-south-1'
  if (!UserPoolId || !ClientId) return null
  return { UserPoolId, ClientId, Region }
}

export function isBrowserCognitoEnabled(): boolean {
  return Boolean(poolConfig())
}

export type CognitoAuthResult = {
  email: string
  role: AppRole
  name?: string
  idToken: string
  accessToken: string
  refreshToken: string
}

type CognitoJsonError = {
  __type?: string
  message?: string
  name?: string
}

async function cognitoCall<T>(
  region: string,
  target: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as T & CognitoJsonError
  if (!res.ok || json.__type) {
    throw normalizeCognitoError({
      code: (json.__type || '').split('#').pop() || json.name || `HTTP_${res.status}`,
      message: json.message || `Cognito ${target} failed (${res.status})`,
    })
  }
  return json
}

function decodeJwtPayload(token: string): Record<string, string> {
  try {
    const part = token.split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json) as Record<string, string>
  } catch {
    return {}
  }
}

function sessionFromTokens(
  tokens: { IdToken: string; AccessToken: string; RefreshToken: string },
  fallbackRole: AppRole,
): CognitoAuthResult {
  const payload = decodeJwtPayload(tokens.IdToken)
  const email = String(payload.email || payload['cognito:username'] || '').toLowerCase()
  const role = (payload['custom:role'] as AppRole) || fallbackRole
  return {
    email,
    role,
    name: payload.name,
    idToken: tokens.IdToken,
    accessToken: tokens.AccessToken,
    refreshToken: tokens.RefreshToken,
  }
}

export async function cognitoSignUp(input: {
  email: string
  password: string
  name: string
  role: AppRole
}): Promise<{ userConfirmed: boolean; userSub?: string }> {
  const cfg = poolConfig()
  if (!cfg) throw new Error('Cognito is not configured')
  const email = input.email.trim().toLowerCase()

  const result = await cognitoCall<{
    UserConfirmed?: boolean
    UserSub?: string
  }>(cfg.Region, 'SignUp', {
    ClientId: cfg.ClientId,
    Username: email,
    Password: input.password,
    // Email-as-username pools: do not also send email attribute (conflicts).
    UserAttributes: [
      { Name: 'name', Value: input.name.trim() || email.split('@')[0] },
      { Name: 'custom:role', Value: input.role },
    ],
  })

  return {
    userConfirmed: Boolean(result.UserConfirmed),
    userSub: result.UserSub,
  }
}

export async function cognitoConfirmSignUp(email: string, code: string): Promise<void> {
  const cfg = poolConfig()
  if (!cfg) throw new Error('Cognito is not configured')
  await cognitoCall(cfg.Region, 'ConfirmSignUp', {
    ClientId: cfg.ClientId,
    Username: email.trim().toLowerCase(),
    ConfirmationCode: code.trim(),
  })
}

export async function cognitoSignIn(input: {
  email: string
  password: string
  role: AppRole
}): Promise<CognitoAuthResult> {
  const cfg = poolConfig()
  if (!cfg) throw new Error('Cognito is not configured')
  const email = input.email.trim().toLowerCase()

  const result = await cognitoCall<{
    AuthenticationResult?: {
      IdToken: string
      AccessToken: string
      RefreshToken: string
    }
    ChallengeName?: string
  }>(cfg.Region, 'InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: cfg.ClientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: input.password,
    },
  })

  if (result.ChallengeName) {
    throw new Error(
      `Cognito requires an extra step (${result.ChallengeName}). Contact the organizer to confirm your account.`,
    )
  }
  if (!result.AuthenticationResult?.IdToken) {
    throw new Error('Cognito sign-in returned no tokens.')
  }

  const session = sessionFromTokens(result.AuthenticationResult, input.role)

  // Best-effort role attribute update — never block login.
  void cognitoCall(cfg.Region, 'UpdateUserAttributes', {
    AccessToken: result.AuthenticationResult.AccessToken,
    UserAttributes: [{ Name: 'custom:role', Value: input.role }],
  }).catch(() => undefined)

  return session
}

function normalizeCognitoError(err: { code?: string; name?: string; message?: string }): Error {
  const code = err?.code || err?.name || ''
  const message = err?.message || 'Cognito request failed'

  if (code === 'UsernameExistsException') {
    return new Error('An account with this email already exists. Switch to Sign in.')
  }
  if (code === 'InvalidPasswordException') {
    return new Error(
      'Password must be at least 8 characters and include a lowercase letter and a number (e.g. hackpay1).',
    )
  }
  if (code === 'UserNotConfirmedException') {
    return new Error('Account is not confirmed yet. Try again in a moment or use Sign in.')
  }
  if (code === 'NotAuthorizedException') {
    return new Error(
      'Incorrect email or password — or no account yet. Use Create account first, then Sign in.',
    )
  }
  if (code === 'InvalidParameterException') {
    // Common when `email` attribute conflicts with username on some pool configs.
    if (/email/i.test(message) && /exist|alias|username/i.test(message)) {
      return new Error(
        'Cognito rejected this email as username. Try Create account again, or redeploy the Cognito pool.',
      )
    }
    return new Error(message)
  }
  if (code === 'UserNotFoundException') {
    return new Error('No account for this email. Switch to Create account.')
  }
  if (code === 'TooManyRequestsException') {
    return new Error('Too many attempts. Wait a minute and try again.')
  }
  return new Error(message)
}

export function cognitoSignOut(_email?: string): void {
  try {
    // Clear any leftover amazon-cognito-identity-js keys from older builds.
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.includes('CognitoIdentityServiceProvider') || k.includes('amplify'))) {
        keys.push(k)
      }
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}

export async function cognitoGetSession(): Promise<CognitoAuthResult | null> {
  // Token refresh can be added later; gate uses explicit sign-in for Ship It.
  return null
}
