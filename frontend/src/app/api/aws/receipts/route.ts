import { NextResponse } from 'next/server'
import { AuthError, requireAuthIfConfigured } from '@/lib/aws/auth'
import { buildReceiptKey, createPresignedPutUrl, receiptPublicUrl, uploadAuditObject } from '@/lib/aws/s3'
import { isS3Configured } from '@/lib/aws/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/aws/receipts — stores JSON audit/receipt on S3.
 * GET /api/aws/receipts?hackathonId=&kind=&id= — returns deterministic CloudFront/S3 URL.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const hackathonId = searchParams.get('hackathonId')?.trim()
  const kind = searchParams.get('kind')?.trim() || 'execute'
  const id = searchParams.get('id')?.trim()
  if (!hackathonId || !id) {
    return NextResponse.json({ success: false, error: 'hackathonId and id are required' }, { status: 400 })
  }
  const url = receiptPublicUrl(hackathonId, kind, id)
  if (!url) {
    return NextResponse.json({ success: false, error: 'S3/CloudFront is not configured' }, { status: 503 })
  }
  return NextResponse.json({ success: true, url, key: buildReceiptKey(hackathonId, kind, id) })
}

export async function POST(request: Request) {
  if (!isS3Configured()) {
    return NextResponse.json({ success: false, error: 'S3 is not configured' }, { status: 503 })
  }

  try {
    await requireAuthIfConfigured(request)
    const body = (await request.json()) as {
      hackathonId?: string
      kind?: string
      id?: string
      payload?: unknown
      presign?: boolean
      contentType?: string
    }

    const hackathonId = body.hackathonId?.trim() || 'general'
    const kind = body.kind?.trim() || 'receipt'
    const id = body.id?.trim() || String(Date.now())
    const key = buildReceiptKey(hackathonId, kind, id)

    if (body.presign) {
      const signed = await createPresignedPutUrl(key, body.contentType || 'application/json')
      if (!signed.ok) {
        return NextResponse.json({ success: false, error: signed.error }, { status: 500 })
      }
      return NextResponse.json({ success: true, key, uploadUrl: signed.url })
    }

    const uploaded = await uploadAuditObject({
      key,
      body: JSON.stringify(body.payload ?? {}, null, 2),
      contentType: 'application/json',
    })

    if (!uploaded.ok) {
      return NextResponse.json({ success: false, error: uploaded.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      key: uploaded.key,
      url: uploaded.url,
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
