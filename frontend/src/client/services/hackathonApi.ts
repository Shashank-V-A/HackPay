import type { Hackathon } from '../types/hackathon'
import {
  deleteHackathonById,
  getHackathonsFromStorage,
  saveHackathonsToStorage,
} from '../holder/utils/roleDetection'
import { broadcastHackathonsDatasetChanged } from '../utils/hackathonSync'
import { PROPOSALS_STORAGE_KEY } from '../utils/payoutProposalsStorage'
import { enrichHackathonLocation } from '../utils/hackathonGlobe'
import { enrichHackathonFunding } from '../utils/format'
import {
  dropLegacyStellarHackathons,
  dropLegacyStellarProposals,
} from '../utils/legacyWeb3Data'
import { authHeaders } from '../utils/authSession'

type HackathonExtras = Hackathon & {
  sponsorFundingXlm?: number
  onChainBalanceXlm?: number
  sponsorFunded?: boolean
  payoutTxHash?: string
  organizerName?: string
  sponsorName?: string
  dbId?: string
}

let hackathonsFetchInFlight: Map<string, Promise<HackathonExtras[]>> = new Map()

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T
  return data
}

function normalizeHackathons(hackathons: HackathonExtras[]): HackathonExtras[] {
  return dropLegacyStellarHackathons(
    hackathons.map((h) => enrichHackathonFunding(enrichHackathonLocation(h))),
  )
}

function fetchKey(filters?: { organizer?: string; sponsor?: string }): string {
  return `${filters?.organizer || ''}|${filters?.sponsor || ''}`
}

/** Load hackathons from Supabase API, falling back to localStorage. */
export async function fetchHackathons(filters?: {
  organizer?: string
  sponsor?: string
}): Promise<HackathonExtras[]> {
  const key = fetchKey(filters)
  const existing = hackathonsFetchInFlight.get(key)
  if (existing) return existing

  const pending = (async () => {
    try {
      const params = new URLSearchParams()
      if (filters?.organizer) params.set('organizer', filters.organizer)
      if (filters?.sponsor) params.set('sponsor', filters.sponsor)
      const qs = params.toString()
      const res = await fetch(`/api/hackathons${qs ? `?${qs}` : ''}`, {
        cache: 'no-store',
        headers: authHeaders(),
      })
      const data = await parseJson<{
        hackathons?: HackathonExtras[]
        source?: string
        error?: string
      }>(res)
      if (!res.ok) {
        throw new Error(data.error || `Failed to load hackathons (${res.status})`)
      }
      if (
        (data.source === 'dynamodb') &&
        Array.isArray(data.hackathons)
      ) {
        const normalized = normalizeHackathons(data.hackathons)
        cacheHackathonsLocally(normalized)
        return normalized
      }
    } catch {
      // fall through to local cache
    }
    return normalizeHackathons(getHackathonsFromStorage() as HackathonExtras[])
  })().finally(() => {
    hackathonsFetchInFlight.delete(key)
  })

  hackathonsFetchInFlight.set(key, pending)
  return pending
}

export async function createHackathon(
  hackathon: HackathonExtras,
): Promise<{ success: boolean; hackathon?: HackathonExtras; error?: string }> {
  try {
    const res = await fetch('/api/hackathons', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(hackathon),
    })
    const data = await parseJson<{
      success: boolean
      hackathon?: HackathonExtras
      error?: string
    }>(res)
    if (!res.ok) {
      return { success: false, error: data.error || `Create failed (${res.status})` }
    }
    if (data.success && data.hackathon) {
      const local = getHackathonsFromStorage() as HackathonExtras[]
      cacheHackathonsLocally([...local, data.hackathon])
      broadcastHackathonsDatasetChanged()
      return data
    }
    return { success: false, error: data.error || 'Create failed' }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Create failed',
    }
  }
}

export async function updateHackathon(
  id: string,
  patch: Partial<HackathonExtras>,
): Promise<{ success: boolean; hackathon?: HackathonExtras; error?: string }> {
  try {
    const res = await fetch(`/api/hackathons/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    })
    const data = await parseJson<{
      success: boolean
      hackathon?: HackathonExtras
      error?: string
    }>(res)
    if (!res.ok) {
      return { success: false, error: data.error || `Update failed (${res.status})` }
    }
    if (data.success && data.hackathon) {
      const local = getHackathonsFromStorage() as HackathonExtras[]
      const next = local.map((h) => (h.id === id ? { ...h, ...data.hackathon } : h))
      cacheHackathonsLocally(next)
      broadcastHackathonsDatasetChanged()
      return data
    }
    return { success: false, error: data.error || 'Update failed' }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Update failed',
    }
  }
}

export async function deleteHackathon(
  id: string,
  organizerWallet?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams()
    if (organizerWallet?.trim()) params.set('organizer', organizerWallet.trim())
    const qs = params.toString()
    const res = await fetch(`/api/hackathons/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`, {
      method: 'DELETE',
    })
    const data = await parseJson<{ success: boolean; error?: string }>(res)
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `Delete failed (${res.status})` }
    }
    deleteHackathonById(id)
    broadcastHackathonsDatasetChanged()
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Delete failed',
    }
  }
}

export async function registerParticipantForHackathon(
  hackathonId: string,
  wallet: string,
  name?: string,
): Promise<{ success: boolean; hackathon?: HackathonExtras; error?: string }> {
  try {
    const res = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, name }),
    })
    const data = await parseJson<{
      success: boolean
      hackathon?: HackathonExtras
      error?: string
    }>(res)
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || `Registration failed (${res.status})` }
    }
    if (data.hackathon) {
      const local = getHackathonsFromStorage() as HackathonExtras[]
      const next = local.some((h) => h.id === data.hackathon!.id)
        ? local.map((h) => (h.id === data.hackathon!.id ? data.hackathon! : h))
        : [...local, data.hackathon!]
      cacheHackathonsLocally(next)
      broadcastHackathonsDatasetChanged()
    }
    return { success: true, hackathon: data.hackathon }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Registration failed',
    }
  }
}

export async function saveAllHackathons(
  hackathons: HackathonExtras[],
): Promise<HackathonExtras[]> {
  saveHackathonsToStorage(hackathons as Hackathon[])
  broadcastHackathonsDatasetChanged()

  const synced = await Promise.all(
    hackathons.map(async (h) => {
      try {
        const res = await fetch(`/api/hackathons/${encodeURIComponent(h.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(h),
        })
        if (res.ok) {
          const data = (await res.json()) as { hackathon?: HackathonExtras }
          if (data.hackathon) return data.hackathon
        }
        if (res.status === 404) {
          const created = await createHackathon(h)
          if (created.success && created.hackathon) return created.hackathon
        }
      } catch {
        // best-effort sync
      }
      return h
    }),
  )

  cacheHackathonsLocally(synced)
  return synced
}

export async function fetchProposals(): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch('/api/proposals', { cache: 'no-store' })
    if (!res.ok) throw new Error('API error')
    const data = await parseJson<{ proposals?: Record<string, unknown>[]; source?: string }>(res)
    if (data.source === 'dynamodb' && Array.isArray(data.proposals)) {
      const cleaned = dropLegacyStellarProposals(data.proposals)
      try {
        localStorage.setItem(PROPOSALS_STORAGE_KEY, JSON.stringify(cleaned))
      } catch {
        // ignore
      }
      return cleaned
    }
  } catch {
    // fall through
  }
  try {
    const stored = localStorage.getItem(PROPOSALS_STORAGE_KEY)
    return dropLegacyStellarProposals(stored ? JSON.parse(stored) : [])
  } catch {
    return []
  }
}

export async function saveAllProposals(proposals: Record<string, unknown>[]): Promise<void> {
  const cleaned = dropLegacyStellarProposals(proposals)
  try {
    localStorage.setItem(PROPOSALS_STORAGE_KEY, JSON.stringify(cleaned))
  } catch {
    // ignore
  }
  broadcastHackathonsDatasetChanged()
  try {
    const res = await fetch('/api/proposals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposals: cleaned }),
    })
    const data = (await res.json()) as { success?: boolean; error?: string }
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Proposal sync failed (${res.status})`)
    }
  } catch (err) {
    if (err instanceof Error) throw err
    throw new Error('Proposal sync failed')
  }
}

function cacheHackathonsLocally(hackathons: HackathonExtras[]): void {
  const enriched = normalizeHackathons(hackathons)
  saveHackathonsToStorage(enriched as Hackathon[], { broadcast: false })
}
