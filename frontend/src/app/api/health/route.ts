import { NextResponse } from 'next/server'
import { INR_VAULT_ID, isRazorpayLiveConfigured, isRazorpayTestMode } from '@/lib/backend/config'
import {
  getActiveDataBackend,
  getAwsRegion,
  getBedrockModelId,
  getCloudFrontUrl,
  getDynamoTableName,
  getS3Bucket,
  getSnsTopicArn,
  isCognitoConfigured,
  isDynamoConfigured,
  isS3Configured,
  isSnsConfigured,
  isStrandsEnabled,
} from '@/lib/aws/env'
import { isSesConfigured } from '@/lib/aws/ses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    product: 'HackPay',
    rail: 'INR',
    hosting: 'aws-amplify',
    vaultId: INR_VAULT_ID,
    razorpayConfigured: isRazorpayLiveConfigured(),
    razorpayTestMode: isRazorpayTestMode(),
    dataBackend: getActiveDataBackend(),
    aws: {
      region: getAwsRegion(),
      cognito: isCognitoConfigured(),
      dynamodb: isDynamoConfigured(),
      dynamoTable: isDynamoConfigured() ? getDynamoTableName() : null,
      s3: isS3Configured(),
      s3Bucket: isS3Configured() ? getS3Bucket() : null,
      cloudFrontUrl: getCloudFrontUrl() || null,
      sns: isSnsConfigured(),
      snsTopicArn: isSnsConfigured() ? getSnsTopicArn() : null,
      ses: isSesConfigured(),
      agentCronSecretConfigured: Boolean(process.env.AGENT_CRON_SECRET?.trim()),
      strands: isStrandsEnabled(),
      bedrockModelId: isStrandsEnabled() ? getBedrockModelId() : null,
      razorpaySecretArnConfigured: Boolean(process.env.RAZORPAY_SECRET_ARN?.trim()),
    },
  })
}
