import { NextResponse } from 'next/server'
import { AuthError, requireAuthIfConfigured } from '@/lib/aws/auth'
import { isSnsConfigured } from '@/lib/aws/env'
import { subscribeEmail } from '@/lib/aws/sns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/aws/sns/subscribe
 * Body: { email } — email protocol subscribe to HackPay agent alerts topic.
 */
export async function POST(request: Request) {
  if (!isSnsConfigured()) {
    return NextResponse.json({ ok: false, error: 'SNS is not configured' }, { status: 503 })
  }

  try {
    await requireAuthIfConfigured(request)
    const body = (await request.json()) as { email?: string }
    const result = await subscribeEmail(body.email || '')
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }
    return NextResponse.json({
      ok: true,
      pendingConfirm: result.pendingConfirm !== false,
      subscriptionArn: result.subscriptionArn,
      message: result.pendingConfirm
        ? 'Check your inbox and confirm the AWS SNS subscription email.'
        : 'Subscribed to HackPay agent alerts.',
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Subscribe failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
