import { NextResponse } from 'next/server'
import { AuthError, requireAuthIfConfigured } from '@/lib/aws/auth'
import { isSesConfigured, sendWinnerEmails } from '@/lib/aws/ses'
import { publishAlert } from '@/lib/aws/sns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/notify/winners
 * Optional SES “you won” + SNS organizer alert. Never blocks winner save.
 */
export async function POST(request: Request) {
  try {
    await requireAuthIfConfigured(request)
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    throw err
  }

  let body: {
    hackathonId?: string
    hackathonName?: string
    currency?: string
    winners?: Array<{ name?: string; email?: string; prizeTier?: string; prizeAmount?: number }>
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const winners = Array.isArray(body.winners) ? body.winners : []
  const hackathonName = body.hackathonName?.trim() || 'HackPay event'

  const ses = isSesConfigured()
    ? await sendWinnerEmails({
        hackathonName,
        winners,
        currency: body.currency || 'INR',
      })
    : { ok: false, sent: 0, skipped: winners.length, error: 'SES not configured' }

  await publishAlert({
    subject: `HackPay winners: ${hackathonName}`,
    message: [
      `Winners selected for ${hackathonName}.`,
      `Count: ${winners.length}.`,
      ses.sent ? `SES mailed ${ses.sent} winner(s).` : 'SES skipped (no verified from-address or no emails).',
    ].join('\n'),
    attributes: {
      stage: 'propose',
      hackathonId: body.hackathonId || '',
    },
  })

  return NextResponse.json({
    ok: true,
    ses,
  })
}
