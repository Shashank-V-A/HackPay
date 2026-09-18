import type { Hackathon, Participant } from '@/client/types/hackathon'
import { hackathonToRow, rowToHackathon, type HackathonRow } from './mappers'
import { isUuid } from './ids'
import { syncHackathonParticipantRoster } from './syncParticipantRoster'

type SupabaseClient = ReturnType<typeof import('./server').createSupabaseServerClient>

export async function findHackathonById(
  supabase: SupabaseClient,
  id: string,
): Promise<{ data: HackathonRow | null; error: Error | null }> {
  const key = id.trim()
  if (!key) return { data: null, error: null }

  const byLegacy = await supabase.from('hackathons').select('*').eq('legacy_id', key).maybeSingle()
  if (byLegacy.error) return { data: null, error: byLegacy.error }
  if (byLegacy.data) return { data: byLegacy.data as HackathonRow, error: null }

  // Legacy ids like `hack_123` are not valid UUIDs — querying `id` with them errors in Postgres.
  if (!isUuid(key)) return { data: null, error: null }

  const byId = await supabase.from('hackathons').select('*').eq('id', key).maybeSingle()
  if (byId.error) return { data: null, error: byId.error }
  return { data: (byId.data as HackathonRow) || null, error: null }
}

export function buildParticipant(wallet: string, name?: string): Participant {
  return {
    id: `p_${wallet.slice(0, 8)}`,
    name: name?.trim() || 'Participant',
    registeredAt: new Date().toISOString(),
    status: 'registered',
    payoutAddress: wallet,
  }
}

export function isWalletOnRoster(hackathon: Hackathon, wallet: string): boolean {
  const normalized = wallet.toLowerCase()
  return Boolean(
    hackathon.participants?.some((p) => p.payoutAddress?.toLowerCase() === normalized),
  )
}

/** Append participant to hackathon payload and upsert global participant profile. */
export async function registerWalletForHackathon(
  supabase: SupabaseClient,
  hackathonId: string,
  wallet: string,
  name?: string,
): Promise<{ hackathon: ReturnType<typeof rowToHackathon>; alreadyRegistered?: boolean }> {
  const trimmedWallet = wallet.trim()
  const { data: existing, error: findError } = await findHackathonById(supabase, hackathonId)
  if (findError) throw findError
  if (!existing) throw new Error('Hackathon not found')

  const current = rowToHackathon(existing)
  if (isWalletOnRoster(current, trimmedWallet)) {
    return { hackathon: current, alreadyRegistered: true }
  }

  const participant = buildParticipant(trimmedWallet, name)
  const participants = [...(current.participants ?? []), participant]

  // Sync relational tables first — if this fails, do not mutate hackathon payload.
  await syncHackathonParticipantRoster(supabase, existing.id, [participant])

  const merged = {
    ...current,
    participants,
    participantCount: participants.length,
    dbId: existing.id,
  }

  const row = hackathonToRow(merged, existing.organizer_id)
  delete (row as { legacy_id?: string }).legacy_id

  const { data, error } = await supabase
    .from('hackathons')
    .update(row)
    .eq('id', existing.id)
    .select('*')
    .single()

  if (error) throw error

  return { hackathon: rowToHackathon(data as HackathonRow) }
}
