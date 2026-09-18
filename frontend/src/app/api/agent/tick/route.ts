import { NextResponse } from 'next/server'
import { runAgentTick } from '@/lib/agent/runTick'
import { AuthError, requireAuthIfConfigured, verifyAgentCronSecret } from '@/lib/aws/auth'
import { isCognitoConfigured } from '@/lib/aws/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleTick(request: Request) {
  try {
    const secretConfigured = Boolean(process.env.AGENT_CRON_SECRET?.trim())
    const cronOk = verifyAgentCronSecret(request)

    if (secretConfigured && !cronOk) {
      if (isCognitoConfigured()) {
        try {
          await requireAuthIfConfigured(request)
        } catch (err) {
          if (err instanceof AuthError) {
            return NextResponse.json({ ok: false, error: 'Unauthorized agent tick' }, { status: 401 })
          }
          throw err
        }
      } else {
        return NextResponse.json({ ok: false, error: 'Unauthorized agent tick' }, { status: 401 })
      }
    }

    const result = await runAgentTick()
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Agent tick failed'
    return NextResponse.json({ ok: false, error: message, actions: [] }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handleTick(request)
}

export async function POST(request: Request) {
  return handleTick(request)
}
