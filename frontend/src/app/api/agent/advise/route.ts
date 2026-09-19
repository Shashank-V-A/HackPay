import { NextResponse } from 'next/server'
import { getPayoutWorkflowStage } from '@/client/utils/payoutWorkflow'
import { strandsAdviseWinners, isStrandsEnabled } from '@/lib/agent/strands'
import { AuthError, requireAuthIfConfigured } from '@/lib/aws/auth'
import { isDatabaseConfigured } from '@/lib/aws/dbReady'
import { rowToHackathon } from '@/lib/db/mappers'
import { createSupabaseServerClient } from '@/lib/db/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * On-demand Strands/Bedrock advice: timeline narrative + ranked winner shortlist.
 * Does not select winners or move money — organizer still confirms in the UI.
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

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'DynamoDB is not configured' }, { status: 503 })
  }
  if (!isStrandsEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Strands is off. Set STRANDS_ENABLED=true and ensure Bedrock model access in this region.',
      },
      { status: 503 },
    )
  }

  let body: { hackathonId?: string }
  try {
    body = (await request.json()) as { hackathonId?: string }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const hackathonId = body.hackathonId?.trim()
  if (!hackathonId) {
    return NextResponse.json({ ok: false, error: 'hackathonId is required' }, { status: 400 })
  }

  const db = createSupabaseServerClient()
  const byLegacy = await db.from('hackathons').select('*').eq('legacy_id', hackathonId).maybeSingle()
  const row =
    byLegacy.data ||
    (await db.from('hackathons').select('*').eq('id', hackathonId).maybeSingle()).data

  if (!row) {
    return NextResponse.json({ ok: false, error: 'Hackathon not found' }, { status: 404 })
  }

  const hackathon = rowToHackathon(row)
  const workflow = getPayoutWorkflowStage(hackathon, [])
  const advice = await strandsAdviseWinners(hackathon, workflow)

  if (advice.ok) {
    const payload = (row.payload || {}) as Record<string, unknown>
    const agent = {
      ...((payload.agent as Record<string, unknown>) || {}),
      timelineSummary: advice.timelineSummary,
      nextSteps: advice.nextSteps,
      suggestions: advice.suggestions,
      adviceAt: new Date().toISOString(),
      adviceProvider: 'strands-bedrock',
    }
    await db
      .from('hackathons')
      .update({ payload: { ...payload, agent } })
      .eq('id', row.id)
  }

  return NextResponse.json(advice, { status: advice.ok ? 200 : 500 })
}
