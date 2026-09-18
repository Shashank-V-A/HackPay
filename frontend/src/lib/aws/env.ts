/**
 * AWS env helpers for HackPay (Cognito, RDS, S3, SNS, cron secret).
 */

export function getAwsRegion(): string {
  return (
    process.env.AWS_REGION?.trim() ||
    process.env.NEXT_PUBLIC_AWS_REGION?.trim() ||
    'ap-south-1'
  )
}

export function isCognitoConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim() &&
      process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim(),
  )
}

export function getCognitoUserPoolId(): string {
  return process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim() || ''
}

export function getCognitoClientId(): string {
  return process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim() || ''
}

export function isRdsConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || ''
}

export function isS3Configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_S3_BUCKET?.trim() || process.env.AWS_S3_BUCKET?.trim())
}

export function getS3Bucket(): string {
  return (
    process.env.AWS_S3_BUCKET?.trim() ||
    process.env.NEXT_PUBLIC_S3_BUCKET?.trim() ||
    ''
  )
}

export function getCloudFrontUrl(): string {
  return (process.env.NEXT_PUBLIC_CLOUDFRONT_URL || '').replace(/\/$/, '')
}

export function getSnsTopicArn(): string {
  return process.env.SNS_TOPIC_ARN?.trim() || process.env.NEXT_PUBLIC_SNS_TOPIC_ARN?.trim() || ''
}

export function isSnsConfigured(): boolean {
  return Boolean(getSnsTopicArn())
}

export function getAgentCronSecret(): string {
  return process.env.AGENT_CRON_SECRET?.trim() || ''
}

/** Prefer RDS when DATABASE_URL is set; otherwise fall back to Supabase. */
export function getDataBackend(): 'rds' | 'supabase' | 'none' {
  if (isRdsConfigured()) return 'rds'
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim()
  ) {
    return 'supabase'
  }
  // Existing project may still use baked-in Supabase defaults
  return 'supabase'
}

/** Alias used across API routes / agent. */
export function getActiveDataBackend(): 'rds' | 'supabase' | 'none' {
  return getDataBackend()
}
