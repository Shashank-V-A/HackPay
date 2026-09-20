/**
 * Lightweight Supabase (PostgREST) client for agent-facing repo_submissions.
 * Uses fetch only — no @supabase/supabase-js dependency.
 *
 * Env:
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...   (server-only; never expose to browser)
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  )
}

function baseUrl(): string {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '') || ''
  if (!url) throw new Error('SUPABASE_URL is not set')
  return url
}

function serviceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return key
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = serviceKey()
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

export type SupabaseRepoSubmissionRow = {
  id: string
  hackathon_id: string
  hackathon_name: string
  wallet_address: string
  participant_name: string
  idea: string
  github_url: string
  track: string | null
  assessment: unknown | null
  created_at: string
  updated_at: string
}

/**
 * Upsert a submission row for DronaHQ agents (source of truth for eval).
 * Failures are logged and returned — DynamoDB remains the app store of record.
 */
export async function upsertSupabaseRepoSubmission(
  row: SupabaseRepoSubmissionRow,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: true } // skipped
  }
  try {
    const res = await fetch(`${baseUrl()}/rest/v1/repo_submissions`, {
      method: 'POST',
      headers: headers({
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify(row),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const message = text.slice(0, 300) || res.statusText
      console.warn('[supabase] upsert repo_submissions failed', res.status, message)
      return { ok: false, error: message }
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upsert failed'
    console.warn('[supabase] upsert repo_submissions error', message)
    return { ok: false, error: message }
  }
}

export async function updateSupabaseRepoAssessment(input: {
  id: string
  assessment: unknown
  updatedAt: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: true }
  }
  try {
    const res = await fetch(
      `${baseUrl()}/rest/v1/repo_submissions?id=eq.${encodeURIComponent(input.id)}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({
          assessment: input.assessment,
          updated_at: input.updatedAt,
        }),
      },
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const message = text.slice(0, 300) || res.statusText
      console.warn('[supabase] patch assessment failed', res.status, message)
      return { ok: false, error: message }
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'patch failed'
    console.warn('[supabase] patch assessment error', message)
    return { ok: false, error: message }
  }
}
