import { NextResponse } from 'next/server'
import { AuthError, requireAuthIfConfigured } from '@/lib/aws/auth'
import { isDatabaseConfigured } from '@/lib/aws/dbReady'
import { getActiveDataBackend } from '@/lib/aws/env'
import { assessPublicRepoSubmission } from '@/lib/agent/submissionAssess'
import { notifySubmissionAgents } from '@/lib/agent/submissionWebhooks'
import { createSupabaseServerClient } from '@/lib/db/server'
import {
  getSubmission,
  listSubmissionsForWallet,
  saveSubmissionAssessment,
  upsertRepoSubmission,
} from '@/lib/db/repoSubmission'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function resolveWallet(
  auth: Awaited<ReturnType<typeof requireAuthIfConfigured>>,
  walletParam?: string | null,
): string {
  return (auth?.email || walletParam || '').trim().toLowerCase()
}

function absoluteCallbackUrl(request: Request): string {
  // Prefer host.docker.internal so Nasiko agent containers can reach HackPay on the host.
  const override = process.env.HACKPAY_PUBLIC_URL?.trim().replace(/\/$/, '')
  if (override) return `${override}/api/participants/submissions/assessment`
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  const host =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
  // When HackPay runs on the host and agents in Docker, rewrite localhost → host.docker.internal
  if (/^localhost(:\d+)?$/i.test(host) || /^127\.0\.0\.1(:\d+)?$/.test(host)) {
    const port = host.includes(':') ? host.split(':')[1] : '3000'
    return `http://host.docker.internal:${port}/api/participants/submissions/assessment`
  }
  return `${proto}://${host}/api/participants/submissions/assessment`
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: 'DYNAMODB_TABLE_NAME is not configured' },
      { status: 503 },
    )
  }

  try {
    const url = new URL(request.url)
    const walletParam = url.searchParams.get('wallet')?.trim().toLowerCase()
    const hackathonId = url.searchParams.get('hackathonId')?.trim() || ''

    let auth: Awaited<ReturnType<typeof requireAuthIfConfigured>> = null
    try {
      auth = await requireAuthIfConfigured(request)
    } catch (err) {
      if (!(err instanceof AuthError) || !walletParam) throw err
    }

    const wallet = resolveWallet(auth, walletParam)
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 })
    }

    const db = createSupabaseServerClient()
    if (hackathonId) {
      const submission = await getSubmission(db, hackathonId, wallet)
      return NextResponse.json({
        success: true,
        submission,
        dataBackend: getActiveDataBackend(),
      })
    }

    const submissions = await listSubmissionsForWallet(db, wallet)
    return NextResponse.json({
      success: true,
      submissions,
      dataBackend: getActiveDataBackend(),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Failed to load submissions'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: 'DYNAMODB_TABLE_NAME is not configured' },
      { status: 503 },
    )
  }

  try {
    const body = (await request.json()) as {
      wallet?: string
      hackathonId?: string
      idea?: string
      githubUrl?: string
      track?: string
      participantName?: string
    }

    let auth: Awaited<ReturnType<typeof requireAuthIfConfigured>> = null
    try {
      auth = await requireAuthIfConfigured(request)
    } catch (err) {
      if (!(err instanceof AuthError) || !body.wallet) throw err
    }

    const wallet = resolveWallet(auth, body.wallet)
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 })
    }
    if (!body.hackathonId?.trim()) {
      return NextResponse.json({ success: false, error: 'hackathonId is required' }, { status: 400 })
    }

    const db = createSupabaseServerClient()
    const submission = await upsertRepoSubmission(db, {
      hackathonId: body.hackathonId,
      wallet,
      idea: body.idea || '',
      githubUrl: body.githubUrl || '',
      track: body.track,
      participantName: body.participantName || auth?.name,
    })

    // Nasiko git-eval (+ Anakin surf). Optional observe / legacy DronaHQ.
    const agentNotify = await notifySubmissionAgents({
      event: 'repo_submission.saved',
      submissionId: submission.id,
      hackathonId: submission.hackathonId,
      hackathonName: submission.hackathonName,
      walletAddress: submission.walletAddress,
      participantName: submission.participantName,
      idea: submission.idea,
      githubUrl: submission.githubUrl,
      track: submission.track,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      callbackUrl: absoluteCallbackUrl(request),
    })

    // Persist assessment from the evaluate response (don't rely only on Docker→host callback).
    let finalSubmission = submission
    let assessment = agentNotify.assessment
    if (!assessment && submission.idea && submission.githubUrl) {
      try {
        assessment = await assessPublicRepoSubmission({
          idea: submission.idea,
          githubUrl: submission.githubUrl,
        })
      } catch (err) {
        console.warn(
          '[agents] local assess fallback failed',
          err instanceof Error ? err.message : err,
        )
      }
    }
    if (assessment) {
      finalSubmission = await saveSubmissionAssessment(
        db,
        submission.hackathonId,
        submission.walletAddress,
        assessment,
      )
    }

    return NextResponse.json({
      success: true,
      submission: finalSubmission,
      dataBackend: getActiveDataBackend(),
      agents: {
        primary: 'nasiko',
        surf: 'anakin',
        notify: agentNotify,
        assessmentSaved: Boolean(assessment),
      },
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Failed to save submission'
    const status = /register|Enter a public|Describe your|not found|Invalid/i.test(message)
      ? 400
      : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
