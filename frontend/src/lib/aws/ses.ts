import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses'
import { getAwsRegion } from '@/lib/aws/env'

let ses: SESClient | null = null

function client(): SESClient {
  if (!ses) ses = new SESClient({ region: getAwsRegion() })
  return ses
}

export function getSesFromEmail(): string {
  return process.env.SES_FROM_EMAIL?.trim() || ''
}

export function isSesConfigured(): boolean {
  return Boolean(getSesFromEmail())
}

/**
 * Optional “you won” mail. No-ops when SES_FROM_EMAIL is unset or identity unverified.
 * Does not block payouts — failures are returned, never thrown to callers.
 */
export async function sendWinnerEmails(input: {
  hackathonName: string
  winners: Array<{ name?: string; email?: string; prizeTier?: string; prizeAmount?: number }>
  currency?: string
}): Promise<{ ok: boolean; sent: number; skipped: number; error?: string }> {
  if (!isSesConfigured()) {
    return { ok: false, sent: 0, skipped: input.winners.length, error: 'SES is not configured' }
  }

  const from = getSesFromEmail()
  let sent = 0
  let skipped = 0
  let lastError = ''

  for (const w of input.winners) {
    const to = (w.email || '').trim()
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      skipped += 1
      continue
    }
    const amount =
      typeof w.prizeAmount === 'number' && w.prizeAmount > 0
        ? `${w.prizeAmount} ${input.currency || 'INR'}`
        : 'your prize'
    const tier = w.prizeTier ? ` (${w.prizeTier})` : ''
    try {
      await client().send(
        new SendEmailCommand({
          Source: from,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: {
              Data: `You won ${input.hackathonName}${tier}`,
              Charset: 'UTF-8',
            },
            Body: {
              Text: {
                Charset: 'UTF-8',
                Data: [
                  `Hi ${w.name || 'winner'},`,
                  '',
                  `Congratulations — you placed on ${input.hackathonName}${tier}.`,
                  `Prize: ${amount}.`,
                  '',
                  'Payout still requires dual organizer/sponsor approval in HackPay.',
                  'This message is informational only.',
                ].join('\n'),
              },
            },
          },
        }),
      )
      sent += 1
    } catch (err) {
      skipped += 1
      lastError = err instanceof Error ? err.message : 'SES send failed'
    }
  }

  return {
    ok: sent > 0,
    sent,
    skipped,
    error: sent === 0 ? lastError || 'No winner emails sent' : undefined,
  }
}
