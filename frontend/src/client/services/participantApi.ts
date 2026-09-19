import { authHeaders } from '../utils/authSession'
import type { ParticipantLinks, ParticipantProfile } from '@/lib/db/participantProfile'

export type { ParticipantLinks, ParticipantProfile }

export async function fetchMyProfile(wallet: string): Promise<{
  success: boolean
  profile?: ParticipantProfile
  error?: string
}> {
  try {
    const qs = wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''
    const res = await fetch(`/api/participants/me${qs}`, {
      method: 'GET',
      headers: authHeaders(),
      cache: 'no-store',
    })
    const data = (await res.json()) as {
      success?: boolean
      profile?: ParticipantProfile
      error?: string
    }
    if (!res.ok || !data.success || !data.profile) {
      return { success: false, error: data.error || `Load failed (${res.status})` }
    }
    return { success: true, profile: data.profile }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Load failed',
    }
  }
}

export type SaveProfileInput = {
  wallet: string
  fullName: string
  username: string
  bio: string
  headline: string
  organization: string
  location: string
  avatarUrl: string
  links: ParticipantLinks
  stack: string[]
}

export async function saveMyProfile(input: SaveProfileInput): Promise<{
  success: boolean
  profile?: ParticipantProfile
  error?: string
}> {
  try {
    const res = await fetch('/api/participants/me', {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        wallet: input.wallet,
        fullName: input.fullName,
        username: input.username || null,
        bio: input.bio || null,
        headline: input.headline || null,
        organization: input.organization || null,
        location: input.location || null,
        avatarUrl: input.avatarUrl || null,
        githubHandle: input.links.github || null,
        links: input.links,
        stack: input.stack,
      }),
    })
    const data = (await res.json()) as {
      success?: boolean
      profile?: ParticipantProfile
      error?: string
    }
    if (!res.ok || !data.success || !data.profile) {
      return { success: false, error: data.error || `Save failed (${res.status})` }
    }
    return { success: true, profile: data.profile }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Save failed',
    }
  }
}

export function formatJoined(iso: string): string {
  try {
    const d = new Date(iso)
    return d
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      .toUpperCase()
  } catch {
    return ''
  }
}

export function linkHref(kind: keyof ParticipantLinks, value: string): string {
  const v = value.trim()
  if (v.startsWith('http://') || v.startsWith('https://')) return v
  if (kind === 'github') return `https://github.com/${v.replace(/^@/, '')}`
  if (kind === 'linkedin') return `https://www.linkedin.com/in/${v.replace(/^@/, '')}`
  if (kind === 'x') return `https://x.com/${v.replace(/^@/, '')}`
  return v
}
