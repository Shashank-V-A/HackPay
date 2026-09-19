import type { HackPayDataClient } from '@/lib/aws/dataClient'

export type ParticipantLinks = {
  github?: string
  linkedin?: string
  x?: string
  portfolio?: string
}

export type ParticipantProfile = {
  id: string
  fullName: string
  email: string | null
  username: string | null
  bio: string | null
  headline: string | null
  organization: string | null
  location: string | null
  avatarUrl: string | null
  githubHandle: string | null
  payoutWalletAddress: string
  links: ParticipantLinks
  stack: string[]
  createdAt: string
  updatedAt: string | null
}

export type ParticipantProfileUpdate = {
  fullName?: string
  username?: string | null
  bio?: string | null
  headline?: string | null
  organization?: string | null
  location?: string | null
  avatarUrl?: string | null
  githubHandle?: string | null
  links?: ParticipantLinks
  stack?: string[]
}

function asLinks(value: unknown): ParticipantLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const out: ParticipantLinks = {}
  for (const key of ['github', 'linkedin', 'x', 'portfolio'] as const) {
    const v = raw[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
  }
  return out
}

function asStack(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 24)
}

function rowToProfile(row: Record<string, unknown>): ParticipantProfile {
  return {
    id: String(row.id),
    fullName: String(row.full_name || 'Participant'),
    email: row.email ? String(row.email) : null,
    username: row.username ? String(row.username) : null,
    bio: row.bio ? String(row.bio) : null,
    headline: row.headline ? String(row.headline) : null,
    organization: row.organization ? String(row.organization) : null,
    location: row.location ? String(row.location) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    githubHandle: row.github_handle ? String(row.github_handle) : null,
    payoutWalletAddress: String(row.payout_wallet_address || ''),
    links: asLinks(row.links),
    stack: asStack(row.stack),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }
}

export async function getParticipantProfileByWallet(
  db: HackPayDataClient,
  wallet: string,
): Promise<ParticipantProfile | null> {
  const key = wallet.trim().toLowerCase()
  if (!key) return null
  const { data, error } = await db
    .from('participants')
    .select('*')
    .eq('payout_wallet_address', key)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return rowToProfile(data as Record<string, unknown>)
}

function sanitizeUsername(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const cleaned = value
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!cleaned) return null
  if (cleaned.length < 2) {
    throw new Error('Username must be at least 2 characters.')
  }
  return cleaned.slice(0, 32)
}

function sanitizeUrlOrHandle(value: string | undefined, kind: keyof ParticipantLinks): string | undefined {
  if (!value?.trim()) return undefined
  let v = value.trim()
  if (kind === 'github' || kind === 'linkedin' || kind === 'x') {
    if (v.startsWith('http://') || v.startsWith('https://')) return v.slice(0, 240)
    return v.replace(/^@/, '').slice(0, 80)
  }
  // Portfolio: accept bare domains and normalize to https://
  if (!(v.startsWith('http://') || v.startsWith('https://'))) {
    v = `https://${v}`
  }
  return v.slice(0, 240)
}

export async function updateParticipantProfile(
  db: HackPayDataClient,
  wallet: string,
  patch: ParticipantProfileUpdate,
): Promise<ParticipantProfile> {
  const key = wallet.trim().toLowerCase()
  const existing = await getParticipantProfileByWallet(db, key)
  if (!existing) {
    throw new Error('Participant profile not found. Sign in again to sync your account.')
  }

  const username =
    patch.username !== undefined ? sanitizeUsername(patch.username) : existing.username

  if (username && username !== existing.username) {
    const { data: rows } = await db.from('participants').select('id, username').limit(200)
    const list = Array.isArray(rows) ? rows : rows ? [rows] : []
    const clash = list.find(
      (row) =>
        String((row as { username?: string }).username || '').toLowerCase() === username &&
        String((row as { id?: string }).id) !== existing.id,
    )
    if (clash) {
      throw new Error('That username is already taken.')
    }
  }

  const linksIn = patch.links || existing.links
  const links: ParticipantLinks = {
    github: sanitizeUrlOrHandle(linksIn.github, 'github'),
    linkedin: sanitizeUrlOrHandle(linksIn.linkedin, 'linkedin'),
    x: sanitizeUrlOrHandle(linksIn.x, 'x'),
    portfolio: sanitizeUrlOrHandle(linksIn.portfolio, 'portfolio'),
  }

  const stack = patch.stack !== undefined ? asStack(patch.stack) : existing.stack
  const fullName =
    patch.fullName !== undefined
      ? patch.fullName.trim() || existing.fullName
      : existing.fullName

  const githubHandle =
    patch.githubHandle !== undefined
      ? patch.githubHandle?.trim() || links.github || null
      : links.github || existing.githubHandle

  const updateRow: Record<string, unknown> = {
    full_name: fullName,
    username,
    bio: patch.bio !== undefined ? patch.bio?.trim() || null : existing.bio,
    headline: patch.headline !== undefined ? patch.headline?.trim() || null : existing.headline,
    organization:
      patch.organization !== undefined
        ? patch.organization?.trim() || null
        : existing.organization,
    location: patch.location !== undefined ? patch.location?.trim() || null : existing.location,
    avatar_url:
      patch.avatarUrl !== undefined ? patch.avatarUrl?.trim() || null : existing.avatarUrl,
    github_handle: githubHandle,
    links,
    stack,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await db
    .from('participants')
    .update(updateRow)
    .eq('id', existing.id)
    .select('*')
    .single()

  if (error) {
    if (/unique|duplicate/i.test(error.message || '')) {
      throw new Error('That username is already taken.')
    }
    throw error
  }
  return rowToProfile(data as Record<string, unknown>)
}
