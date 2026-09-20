import { NextResponse } from 'next/server'
import { AuthError, requireAuthIfConfigured } from '@/lib/aws/auth'
import { isDatabaseConfigured } from '@/lib/aws/dbReady'
import { getActiveDataBackend } from '@/lib/aws/env'
import { assessPublicRepoSubmission } from '@/lib/agent/submissionAssess'
import { createSupabaseServerClient } from '@/lib/db/server'
import { getSubmission, saveSubmissionAssessment } from '@/lib/db/repoSubmission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Generate / refresh an Accio-style assessment report for a stored submission.
 * Body: { hackathonId, wallet? }
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: 'DYNAMODB_TABLE_NAME is not configured' },
      { status: 503 },
    )
  }

  try {
    const body = (await request.json()) as { hackathonId?: string; wallet?: string }

    let auth: Awaited<ReturnType<typeof requireAuthIfConfigured>> = null
    try {
      auth = await requireAuthIfConfigured(request)
    } catch (err) {
      if (!(err instanceof AuthError) || !body.wallet) throw err
    }

    const wallet = (auth?.email || body.wallet || '').trim().toLowerCase()
    const hackathonId = body.hackathonId?.trim() || ''
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 })
    }
    if (!hackathonId) {
      return NextResponse.json({ success: false, error: 'hackathonId is required' }, { status: 400 })
    }

    const db = createSupabaseServerClient()
    const existing = await getSubmission(db, hackathonId, wallet)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Submit a GitHub repo first, then generate the report.' },
        { status: 404 },
      )
    }

    const assessment = await assessPublicRepoSubmission({
      idea: existing.idea,
      githubUrl: existing.githubUrl,
    })
    const submission = await saveSubmissionAssessment(db, hackathonId, wallet, assessment)

    return NextResponse.json({
      success: true,
      submission,
      dataBackend: getActiveDataBackend(),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Assessment failed'
    const status = /GitHub|Invalid|Submit/i.test(message) ? 400 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
