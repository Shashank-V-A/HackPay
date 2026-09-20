import { NextResponse } from 'next/server'
import { isDatabaseConfigured } from '@/lib/aws/dbReady'
import { getActiveDataBackend } from '@/lib/aws/env'
import { getSubmissionAgentCallbackSecret } from '@/lib/agent/submissionWebhooks'
import { createSupabaseServerClient } from '@/lib/db/server'
import {
  saveSubmissionAssessment,
  type SubmissionAssessment,
} from '@/lib/db/repoSubmission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Callback for DronaHQ Report Agent to write assessment JSON into DynamoDB.
 * Auth: header `x-hackpay-agent-secret` or `api-key` matching SUBMISSION_AGENT_CALLBACK_SECRET.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: 'DYNAMODB_TABLE_NAME is not configured' },
      { status: 503 },
    )
  }

  const secret = getSubmissionAgentCallbackSecret()
  if (!secret) {
    return NextResponse.json(
      { success: false, error: 'SUBMISSION_AGENT_CALLBACK_SECRET is not configured' },
      { status: 503 },
    )
  }

  const provided =
    request.headers.get('x-hackpay-agent-secret')?.trim() ||
    request.headers.get('api-key')?.trim() ||
    ''
  if (provided !== secret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as {
      hackathonId?: string
      wallet?: string
      walletAddress?: string
      assessment?: SubmissionAssessment
    }

    const hackathonId = body.hackathonId?.trim() || ''
    const wallet = (body.walletAddress || body.wallet || '').trim().toLowerCase()
    if (!hackathonId || !wallet) {
      return NextResponse.json(
        { success: false, error: 'hackathonId and wallet are required' },
        { status: 400 },
      )
    }
    if (!body.assessment || typeof body.assessment !== 'object') {
      return NextResponse.json({ success: false, error: 'assessment object is required' }, { status: 400 })
    }

    const assessment: SubmissionAssessment = {
      ...body.assessment,
      assessedAt: body.assessment.assessedAt || new Date().toISOString(),
      provider: body.assessment.provider || 'dronahq',
    }

    const db = createSupabaseServerClient()
    const submission = await saveSubmissionAssessment(db, hackathonId, wallet, assessment)

    return NextResponse.json({
      success: true,
      submission,
      dataBackend: getActiveDataBackend(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save assessment'
    const status = /Submit a GitHub|not found/i.test(message) ? 404 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
