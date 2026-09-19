import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getAwsRegion, getCloudFrontUrl, getS3Bucket, isS3Configured } from '@/lib/aws/env'

let s3: S3Client | null = null

function client(): S3Client {
  if (!s3) {
    s3 = new S3Client({ region: getAwsRegion() })
  }
  return s3
}

export type UploadReceiptInput = {
  key: string
  body: string | Uint8Array | Buffer
  contentType?: string
}

/**
 * Store a receipt / audit JSON blob in S3. Returns CloudFront or s3 URL.
 */
export async function uploadAuditObject(input: UploadReceiptInput): Promise<{
  ok: boolean
  key?: string
  url?: string
  error?: string
}> {
  if (!isS3Configured()) {
    return { ok: false, error: 'S3 is not configured' }
  }

  const bucket = getS3Bucket()
  const key = input.key.replace(/^\//, '')

  try {
    await client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType || 'application/json',
      }),
    )
    const cdn = getCloudFrontUrl()
    const url = cdn
      ? `${cdn}/${key}`
      : `https://${bucket}.s3.${getAwsRegion()}.amazonaws.com/${key}`
    return { ok: true, key, url }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'S3 upload failed',
    }
  }
}

export async function createPresignedPutUrl(
  key: string,
  contentType = 'application/octet-stream',
  expiresIn = 900,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!isS3Configured()) return { ok: false, error: 'S3 is not configured' }
  try {
    const command = new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key.replace(/^\//, ''),
      ContentType: contentType,
    })
    const url = await getSignedUrl(client(), command, { expiresIn })
    return { ok: true, url }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Presign failed' }
  }
}

export function buildReceiptKey(hackathonId: string, kind: string, id: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `receipts/${safe(hackathonId)}/${safe(kind)}/${safe(id)}.json`
}

/** Deterministic public URL for a receipt key (CloudFront preferred). */
export function receiptPublicUrl(hackathonId: string, kind: string, id: string): string | null {
  if (!isS3Configured() && !getCloudFrontUrl()) return null
  const key = buildReceiptKey(hackathonId, kind, id)
  const cdn = getCloudFrontUrl()
  if (cdn) return `${cdn}/${key}`
  const bucket = getS3Bucket()
  if (!bucket) return null
  return `https://${bucket}.s3.${getAwsRegion()}.amazonaws.com/${key}`
}
