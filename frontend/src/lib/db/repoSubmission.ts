import type { HackPayDataClient } from '@/lib/aws/dataClient'
import { hackathonToRow, rowToHackathon, type HackathonRow } from './mappers'
import { findHackathonById } from './registerParticipant'
import {
  updateSupabaseRepoAssessment,
  upsertSupabaseRepoSubmission,
} from './supabaseSubmissions'

export type SubmissionScores = {
  ideaFit: number
  completeness: number
  activity: number
  docs: number
  overall: number
}

export type SubmissionAssessment = {
  assessedAt: string
  provider: 'hackpay-heuristic' | 'dronahq' | 'strands' | 'nasiko-anakin'
  scores: SubmissionScores
  evidence: {
    license?: string | null
    language?: string | null
    stars?: number
    lastPush?: string | null
    description?: string | null
    topics?: string[]
    hasReadme?: boolean
    filesReviewed?: number
    treeSample?: string[]
    ideaCoverage?: number
    deepFlags?: Record<string, boolean>
  }
  signals: Array<{ label: string; value: string }>
  strengths: string[]
  improvements: string[]
  overallFeedback: string
  aiFeedback?: string
  deepReport?: string
  filesReviewed?: Array<{ path: string; chars: number; source: string }>
}

export type RepoSubmission = {
  id: string
  hackathonId: string
  hackathonName: string
  walletAddress: string
  participantName: string
  idea: string
  githubUrl: string
  track?: string | null
  createdAt: string
  updatedAt: string
  assessment?: SubmissionAssessment | null
}

function asAssessment(value: unknown): SubmissionAssessment | null {
  if (!value || typeof value !== 'object') return null
  return value as SubmissionAssessment
}

function rowToSubmission(row: Record<string, unknown>): RepoSubmission {
  return {
    id: String(row.id),
    hackathonId: String(row.hackathon_id),
    hackathonName: String(row.hackathon_name || ''),
    walletAddress: String(row.wallet_address || '').toLowerCase(),
    participantName: String(row.participant_name || 'Participant'),
    idea: String(row.idea || ''),
    githubUrl: String(row.github_url || ''),
    track: row.track ? String(row.track) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.created_at || new Date().toISOString()),
    assessment: asAssessment(row.assessment),
  }
}

export function parseGithubRepo(value: string): { owner: string; repo: string; url: string } | null {
  const text = value.trim()
  const match = text.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)/i)
  if (match) {
    const owner = match[1]
    const repo = match[2].replace(/\.git$/i, '')
    return { owner, repo, url: `https://github.com/${owner}/${repo}` }
  }
  if (/^[^/\s]+\/[^/\s]+$/.test(text)) {
    const [owner, repoRaw] = text.split('/')
    const repo = repoRaw.replace(/\.git$/i, '')
    return { owner, repo, url: `https://github.com/${owner}/${repo}` }
  }
  return null
}

export async function listSubmissionsForWallet(
  db: HackPayDataClient,
  wallet: string,
): Promise<RepoSubmission[]> {
  const key = wallet.trim().toLowerCase()
  if (!key) return []
  const { data, error } = await db
    .from('repo_submissions')
    .select('*')
    .eq('wallet_address', key)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw error
  const rows = Array.isArray(data) ? data : data ? [data] : []
  return rows
    .map((row) => rowToSubmission(row as Record<string, unknown>))
    .filter((s) => s.walletAddress === key)
}

export async function getSubmission(
  db: HackPayDataClient,
  hackathonId: string,
  wallet: string,
): Promise<RepoSubmission | null> {
  const id = `${hackathonId.trim()}#${wallet.trim().toLowerCase()}`
  const { data, error } = await db.from('repo_submissions').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return rowToSubmission(data as Record<string, unknown>)
}

export async function upsertRepoSubmission(
  db: HackPayDataClient,
  input: {
    hackathonId: string
    wallet: string
    idea: string
    githubUrl: string
    track?: string | null
    participantName?: string
  },
): Promise<RepoSubmission> {
  const wallet = input.wallet.trim().toLowerCase()
  const parsed = parseGithubRepo(input.githubUrl)
  if (!parsed) {
    throw new Error('Enter a public GitHub URL (https://github.com/owner/repo) or owner/repo.')
  }
  const idea = input.idea.trim()
  if (idea.length < 12) {
    throw new Error('Describe your idea in at least a short paragraph (12+ characters).')
  }

  const { data: hackRow, error: findError } = await findHackathonById(db, input.hackathonId)
  if (findError) throw findError
  if (!hackRow) throw new Error('Hackathon not found')

  const hackathon = rowToHackathon(hackRow as HackathonRow)
  const onRoster = hackathon.participants?.some(
    (p) => p.payoutAddress?.toLowerCase() === wallet,
  )
  if (!onRoster) {
    throw new Error('Register for this hackathon before submitting a repo.')
  }

  const existing = await getSubmission(db, hackRow.id, wallet)
  const now = new Date().toISOString()
  const participant =
    hackathon.participants?.find((p) => p.payoutAddress?.toLowerCase() === wallet) || null

  const row: Record<string, unknown> = {
    id: `${hackRow.id}#${wallet}`,
    hackathon_id: hackRow.id,
    hackathon_name: hackathon.name,
    wallet_address: wallet,
    participant_name: input.participantName?.trim() || participant?.name || 'Participant',
    idea,
    github_url: parsed.url,
    track: input.track?.trim() || participant?.track || null,
    created_at: existing?.createdAt || now,
    updated_at: now,
    assessment: existing?.assessment || null,
  }

  const { data, error } = await db
    .from('repo_submissions')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) throw error

  const participants = (hackathon.participants || []).map((p) =>
    p.payoutAddress?.toLowerCase() === wallet
      ? {
          ...p,
          project: parsed.url,
          githubUrl: parsed.url,
          idea,
          track: input.track?.trim() || p.track,
        }
      : p,
  )
  const merged = { ...hackathon, participants, dbId: hackRow.id }
  const updateRow = hackathonToRow(merged, (hackRow as HackathonRow).organizer_id)
  delete (updateRow as { legacy_id?: string }).legacy_id
  await db.from('hackathons').update(updateRow).eq('id', hackRow.id)

  const submission = rowToSubmission(data as Record<string, unknown>)

  const sb = await upsertSupabaseRepoSubmission({
    id: submission.id,
    hackathon_id: submission.hackathonId,
    hackathon_name: submission.hackathonName,
    wallet_address: submission.walletAddress,
    participant_name: submission.participantName,
    idea: submission.idea,
    github_url: submission.githubUrl,
    track: submission.track ?? null,
    assessment: submission.assessment ?? null,
    created_at: submission.createdAt,
    updated_at: submission.updatedAt,
  })
  if (!sb.ok) {
    console.warn('[repoSubmission] Supabase mirror failed:', sb.error)
  }

  return submission
}

export async function saveSubmissionAssessment(
  db: HackPayDataClient,
  hackathonId: string,
  wallet: string,
  assessment: SubmissionAssessment,
): Promise<RepoSubmission> {
  const existing = await getSubmission(db, hackathonId, wallet)
  if (!existing) throw new Error('Submit a GitHub repo before generating a report.')

  const updatedAt = new Date().toISOString()
  const { data, error } = await db
    .from('repo_submissions')
    .update({
      assessment,
      updated_at: updatedAt,
    })
    .eq('id', existing.id)
    .select('*')
    .single()
  if (error) throw error

  const submission = rowToSubmission(data as Record<string, unknown>)

  const sb = await updateSupabaseRepoAssessment({
    id: submission.id,
    assessment,
    updatedAt,
  })
  if (!sb.ok) {
    console.warn('[repoSubmission] Supabase assessment mirror failed:', sb.error)
  }

  return submission
}
