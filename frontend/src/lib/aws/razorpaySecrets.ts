import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import { getAwsRegion } from '@/lib/aws/env'

let hydrated = false
let hydratePromise: Promise<void> | null = null

/**
 * Optionally load Razorpay keys from Secrets Manager when Amplify env is empty.
 * Env vars always win if already set — never overwrites a live Amplify config.
 */
export async function hydrateRazorpaySecrets(): Promise<void> {
  if (hydrated) return
  if (hydratePromise) return hydratePromise

  hydratePromise = (async () => {
    const arn =
      process.env.RAZORPAY_SECRET_ARN?.trim() ||
      process.env.HACKPAY_RAZORPAY_SECRET_ARN?.trim() ||
      ''
    if (!arn) {
      hydrated = true
      return
    }
    if (process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim()) {
      hydrated = true
      return
    }

    try {
      const client = new SecretsManagerClient({ region: getAwsRegion() })
      const res = await client.send(new GetSecretValueCommand({ SecretId: arn }))
      const raw = res.SecretString || ''
      const parsed = JSON.parse(raw) as Record<string, string>
      if (!process.env.RAZORPAY_KEY_ID?.trim() && parsed.RAZORPAY_KEY_ID) {
        process.env.RAZORPAY_KEY_ID = String(parsed.RAZORPAY_KEY_ID).trim()
      }
      if (!process.env.RAZORPAY_KEY_SECRET?.trim() && parsed.RAZORPAY_KEY_SECRET) {
        process.env.RAZORPAY_KEY_SECRET = String(parsed.RAZORPAY_KEY_SECRET).trim()
      }
      if (
        !process.env.RAZORPAYX_ACCOUNT_NUMBER?.trim() &&
        parsed.RAZORPAYX_ACCOUNT_NUMBER
      ) {
        process.env.RAZORPAYX_ACCOUNT_NUMBER = String(parsed.RAZORPAYX_ACCOUNT_NUMBER).trim()
      }
    } catch {
      // Keep Amplify/env fallbacks; do not fail funding.
    } finally {
      hydrated = true
    }
  })()

  return hydratePromise
}
