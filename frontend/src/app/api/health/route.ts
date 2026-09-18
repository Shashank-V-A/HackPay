import { NextResponse } from 'next/server'
import { INR_VAULT_ID, isRazorpayLiveConfigured, isRazorpayTestMode } from '@/lib/backend/config'
import {
  getSupabaseConfigSource,
  getSupabaseUrl,
  isSupabaseConfigured,
} from '@/lib/supabase/env'
import {
  getActiveDataBackend,
  getAwsRegion,
  getCloudFrontUrl,
  getS3Bucket,
  getSnsTopicArn,
  isCognitoConfigured,
  isRdsConfigured,
  isS3Configured,
  isSnsConfigured,
} from '@/lib/aws/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const configured = isSupabaseConfigured()
  return NextResponse.json({
    ok: true,
    product: 'HackPay',
    rail: 'INR',
    vaultId: INR_VAULT_ID,
    razorpayConfigured: isRazorpayLiveConfigured(),
    razorpayTestMode: isRazorpayTestMode(),
    dataBackend: getActiveDataBackend(),
    aws: {
      region: getAwsRegion(),
      cognito: isCognitoConfigured(),
      rds: isRdsConfigured(),
      s3: isS3Configured(),
      s3Bucket: isS3Configured() ? getS3Bucket() : null,
      cloudFrontUrl: getCloudFrontUrl() || null,
      sns: isSnsConfigured(),
      snsTopicArn: isSnsConfigured() ? getSnsTopicArn() : null,
      agentCronSecretConfigured: Boolean(process.env.AGENT_CRON_SECRET?.trim()),
    },
    supabaseConfigured: configured,
    supabaseUrl: configured ? getSupabaseUrl() : null,
    supabaseConfigSource: getSupabaseConfigSource(),
    hasSupabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  })
}
