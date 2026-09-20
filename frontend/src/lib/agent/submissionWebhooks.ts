/**
 * Git eval pipeline:
 * - Nasiko = deploy / observe the git-eval agent (primary remote runner)
 * - Anakin = surf GitHub repo URLs (used inside assess + Nasiko agent)
 * - DronaHQ = optional legacy webhook (disabled unless URL set)
 */

import type { SubmissionAssessment } from '@/lib/db/repoSubmission'

export type SubmissionAgentPayload = {
  event: 'repo_submission.saved'
  submissionId: string
  hackathonId: string
  hackathonName: string
  walletAddress: string
  participantName: string
  idea: string
  githubUrl: string
  track?: string | null
  createdAt: string
  updatedAt: string
  callbackUrl?: string
}

function trimEnv(name: string): string {
  return process.env[name]?.trim() || ''
}

export function getNasikoGitEvalUrl(): string {
  return trimEnv('NASIKO_GIT_EVAL_URL')
}

export function getNasikoGitEvalApiKey(): string {
  return trimEnv('NASIKO_GIT_EVAL_API_KEY')
}

export function getNasikoObserveWebhookUrl(): string {
  return trimEnv('NASIKO_OBSERVE_WEBHOOK_URL')
}

/** @deprecated Prefer Nasiko + Anakin. Kept for optional legacy fan-out. */
export function getDronaHqSubmissionWebhookUrl(): string {
  return trimEnv('DRONAHQ_SUBMISSION_WEBHOOK_URL')
}

export function getDronaHqWebhookApiKey(): string {
  return trimEnv('DRONAHQ_WEBHOOK_API_KEY')
}

export function getSubmissionAgentCallbackSecret(): string {
  return trimEnv('SUBMISSION_AGENT_CALLBACK_SECRET') || trimEnv('AGENT_CRON_SECRET')
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; error?: string; data?: unknown }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
    const text = await res.text().catch(() => '')
    let data: unknown
    try {
      data = text ? JSON.parse(text) : undefined
    } catch {
      data = undefined
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: text.slice(0, 200) || res.statusText, data }
    }
    return { ok: true, status: res.status, data }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'request failed',
    }
  }
}

function pickAssessment(data: unknown): SubmissionAssessment | undefined {
  if (!data || typeof data !== 'object') return undefined
  const root = data as Record<string, unknown>
  const raw = root.assessment
  if (!raw || typeof raw !== 'object') return undefined
  const a = raw as SubmissionAssessment
  if (!a.scores || typeof a.scores.overall !== 'number') return undefined
  return {
    ...a,
    assessedAt: a.assessedAt || new Date().toISOString(),
    provider: a.provider || 'nasiko-anakin',
  }
}

/** Notify Nasiko git-eval agent (+ optional observe / legacy DronaHQ). */
export async function notifySubmissionAgents(payload: SubmissionAgentPayload): Promise<{
  nasikoEval: { ok: boolean; skipped?: boolean; error?: string }
  nasikoObserve: { ok: boolean; skipped?: boolean; error?: string }
  dronahq: { ok: boolean; skipped?: boolean; error?: string }
  assessment?: SubmissionAssessment
}> {
  const evalUrl = getNasikoGitEvalUrl()
  const observeUrl = getNasikoObserveWebhookUrl()
  const dronaUrl = getDronaHqSubmissionWebhookUrl()
  const evalKey = getNasikoGitEvalApiKey()
  const dronaKey = getDronaHqWebhookApiKey()

  const result: {
    nasikoEval: { ok: boolean; skipped?: boolean; error?: string }
    nasikoObserve: { ok: boolean; skipped?: boolean; error?: string }
    dronahq: { ok: boolean; skipped?: boolean; error?: string }
    assessment?: SubmissionAssessment
  } = {
    nasikoEval: { ok: true, skipped: true },
    nasikoObserve: { ok: true, skipped: true },
    dronahq: { ok: true, skipped: true },
  }

  if (evalUrl) {
    const headers: Record<string, string> = {}
    if (evalKey) {
      headers['Authorization'] = `Bearer ${evalKey}`
      headers['api-key'] = evalKey
    }
    const res = await postJson(evalUrl, payload, headers)
    result.nasikoEval = { ok: res.ok, skipped: false, error: res.error }
    if (!res.ok) console.warn('[agents] Nasiko git-eval failed', res.status, res.error)
    else {
      const assessment = pickAssessment(res.data)
      if (assessment) result.assessment = assessment
    }
  }

  if (observeUrl) {
    const res = await postJson(observeUrl, {
      type: 'hackpay.submission.observe',
      source: 'hackpay',
      agentPlatform: 'nasiko',
      surf: 'anakin',
      observability: true,
      submissionId: payload.submissionId,
      hackathonId: payload.hackathonId,
      walletAddress: payload.walletAddress,
      githubUrl: payload.githubUrl,
      at: new Date().toISOString(),
    })
    result.nasikoObserve = { ok: res.ok, skipped: false, error: res.error }
    if (!res.ok) console.warn('[agents] Nasiko observe failed', res.status, res.error)
  }

  if (dronaUrl) {
    const headers: Record<string, string> = {}
    if (dronaKey) headers['api-key'] = dronaKey
    const res = await postJson(dronaUrl, payload, headers)
    result.dronahq = { ok: res.ok, skipped: false, error: res.error }
  }

  return result
}
