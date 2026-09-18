import type { Participant } from '@/client/types/hackathon'
import { ensureParticipant } from './mappers'

type SupabaseClient = ReturnType<typeof import('./server').createSupabaseServerClient>

function formatSupabaseError(context: string, error: { message: string; code?: string }): Error {
  const hint =
    error.code === '42501' || error.message.toLowerCase().includes('row-level security')
      ? ' Apply infra/sql migrations against RDS (npm run migrate:rds).'
      : error.code === '42P01' || error.code === 'PGRST205'
        ? ' The hackathon_registrations table is missing — run npm run migrate:rds.'
        : ''
  return new Error(`${context}: ${error.message}.${hint}`)
}

/**
 * Mirror hackathon payload participants into relational tables:
 * - `participants` (global profile: full_name, payout_wallet_address)
 * - `hackathon_registrations` (per-event roster: status, display_name, registered_at)
 *
 * Throws on any failure so API routes return an accurate HTTP error instead of 200 OK.
 */
export async function syncHackathonParticipantRoster(
  supabase: SupabaseClient,
  hackathonDbId: string,
  participants: Participant[],
): Promise<void> {
  for (const participant of participants) {
    const wallet = participant.payoutAddress?.trim()
    if (!wallet) continue

    let participantId: string
    try {
      participantId = await ensureParticipant(supabase, wallet, participant.name)
    } catch (err) {
      console.error('Failed to upsert participants table:', { wallet, err })
      throw err instanceof Error
        ? err
        : new Error(`Failed to upsert participants table for wallet ${wallet}`)
    }

    const { error } = await supabase.from('hackathon_registrations').upsert(
      {
        hackathon_id: hackathonDbId,
        participant_id: participantId,
        wallet_address: wallet,
        display_name: participant.name?.trim() || 'Participant',
        status: participant.status || 'registered',
        registered_at: participant.registeredAt || new Date().toISOString(),
      },
      { onConflict: 'hackathon_id,wallet_address' },
    )

    if (error) {
      console.error('Failed to upsert hackathon_registrations:', { wallet, error })
      throw formatSupabaseError(`hackathon_registrations upsert failed for ${wallet}`, error)
    }
  }
}
