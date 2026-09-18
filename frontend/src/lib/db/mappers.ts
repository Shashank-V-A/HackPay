import type { Hackathon, HackathonAgentState, Participant, Winner } from '@/client/types/hackathon'
import { enrichHackathonLocation } from '@/client/utils/hackathonGlobe'
import { INR_VAULT_ID } from '@/client/constants/escrow'
import { coerceUuid } from './ids'

export type HackathonRow = {
  id: string
  legacy_id: string | null
  organizer_id: string | null
  name: string
  description: string | null
  metadata_ipfs_cid: string | null
  start_date: string | null
  end_date: string | null
  status: 'upcoming' | 'live' | 'completed' | 'cancelled'
  organizer_wallet: string
  sponsor_wallet: string | null
  contract_id: string | null
  prize_pool_total: number | string
  prize_pool_currency: string
  sponsor_funding_xlm: number | string
  on_chain_balance_xlm: number | string | null
  payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type ProposalRow = {
  id: string
  legacy_id: string | null
  escrow_id: string | null
  hackathon_id: string | null
  onchain_proposal_id: number | null
  status: string
  created_by_wallet: string | null
  payload: Record<string, unknown> | null
  created_at: string
  executed_at: string | null
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseCoordField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function isAgentState(value: unknown): value is HackathonAgentState {
  return Boolean(value) && typeof value === 'object'
}

export function rowToHackathon(row: HackathonRow): Hackathon & {
  sponsorFundingXlm?: number
  onChainBalanceXlm?: number
  dbId?: string
} {
  const payload = (row.payload || {}) as Record<string, unknown>
  const participants = (payload.participants as Participant[]) || []
  const winners = (payload.winners as Winner[]) || undefined

  return enrichHackathonLocation({
    id: row.legacy_id || row.id,
    dbId: row.id,
    name: row.name,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    prizePool: {
      total: num(row.prize_pool_total),
      currency: row.prize_pool_currency || 'INR',
      locked: true,
    },
    organizerAddress: row.organizer_wallet,
    sponsorAddress: row.sponsor_wallet || '',
    escrowAddress: row.contract_id || INR_VAULT_ID,
    status:
      row.status === 'cancelled'
        ? 'completed'
        : (row.status as Hackathon['status']),
    participantCount: participants.length,
    participants,
    winners,
    winnersSelected: Boolean(payload.winnersSelected),
    payoutProposed: Boolean(payload.payoutProposed),
    payoutExecuted: Boolean(payload.payoutExecuted),
    payoutTxHash: typeof payload.payoutTxHash === 'string' ? payload.payoutTxHash : undefined,
    organizerName: typeof payload.organizerName === 'string' ? payload.organizerName : undefined,
    sponsorName: typeof payload.sponsorName === 'string' ? payload.sponsorName : undefined,
    sponsorFunded:
      Boolean(payload.sponsorFunded) ||
      (Boolean(row.sponsor_wallet) &&
        num(row.sponsor_funding_xlm) > 0 &&
        num(row.sponsor_funding_xlm) >= num(row.prize_pool_total)),
    description: row.description || undefined,
    venueCity: typeof payload.venueCity === 'string' ? payload.venueCity : undefined,
    latitude: parseCoordField(payload.latitude),
    longitude: parseCoordField(payload.longitude),
    sponsorFundingXlm: num(row.sponsor_funding_xlm),
    onChainBalanceXlm: row.on_chain_balance_xlm != null ? num(row.on_chain_balance_xlm) : undefined,
    agent: isAgentState(payload.agent) ? payload.agent : undefined,
  })
}

export function hackathonToRow(
  hackathon: Hackathon & {
    sponsorFundingXlm?: number
    onChainBalanceXlm?: number
    dbId?: string
  },
  organizerId?: string | null,
): Partial<HackathonRow> {
  const legacyId = hackathon.id.startsWith('hack_') ? hackathon.id : `hack_${Date.now()}`

  return {
    legacy_id: legacyId,
    organizer_id: organizerId ?? null,
    name: hackathon.name,
    description: hackathon.description || null,
    start_date: hackathon.startDate || null,
    end_date: hackathon.endDate || null,
    status:
      hackathon.status === 'completed'
        ? 'completed'
        : hackathon.status === 'live'
          ? 'live'
          : 'upcoming',
    organizer_wallet: hackathon.organizerAddress,
    sponsor_wallet: hackathon.sponsorAddress || null,
    contract_id: hackathon.escrowAddress || INR_VAULT_ID,
    prize_pool_total: hackathon.prizePool?.total ?? 0,
    prize_pool_currency: hackathon.prizePool?.currency || 'INR',
    sponsor_funding_xlm: hackathon.sponsorFundingXlm ?? 0,
    on_chain_balance_xlm: hackathon.onChainBalanceXlm ?? null,
    payload: {
      participants: hackathon.participants || [],
      winners: hackathon.winners || [],
      winnersSelected: hackathon.winnersSelected ?? false,
      payoutProposed: hackathon.payoutProposed ?? false,
      payoutExecuted: hackathon.payoutExecuted ?? false,
      payoutTxHash: hackathon.payoutTxHash ?? null,
      organizerName: hackathon.organizerName ?? null,
      sponsorName: hackathon.sponsorName ?? null,
      sponsorFunded:
        hackathon.sponsorFunded ??
        (Number(hackathon.sponsorFundingXlm ?? 0) > 0 &&
          Boolean(hackathon.sponsorAddress) &&
          Number(hackathon.sponsorFundingXlm ?? 0) >= Number(hackathon.prizePool?.total ?? 0)),
      venueCity: hackathon.venueCity || null,
      latitude:
        typeof hackathon.latitude === 'number' && Number.isFinite(hackathon.latitude)
          ? hackathon.latitude
          : null,
      longitude:
        typeof hackathon.longitude === 'number' && Number.isFinite(hackathon.longitude)
          ? hackathon.longitude
          : null,
      agent: hackathon.agent ?? null,
    },
  }
}

export function rowToProposal(row: ProposalRow): Record<string, unknown> {
  const payload = (row.payload || {}) as Record<string, unknown>
  return {
    id: row.legacy_id || row.id,
    dbId: row.id,
    hackathonId: payload.hackathonId ?? row.hackathon_id,
    hackathonName: payload.hackathonName,
    createdAt: payload.createdAt ?? row.created_at,
    status: payload.status ?? row.status,
    organizerApproved: payload.organizerApproved ?? true,
    sponsorApproved:
      payload.sponsorApproved ??
      (row.status === 'sponsor_approved' || row.status === 'executed'),
    winners: payload.winners,
    eventEndDate: payload.eventEndDate,
    txHash: payload.txHash,
    onChainProposalId: row.onchain_proposal_id ?? payload.onChainProposalId,
  }
}

export function proposalToRow(
  proposal: Record<string, unknown>,
  hackathonDbId?: string | null,
): Partial<ProposalRow> {
  const legacyId = String(proposal.id || `prop_${Date.now()}`)
  const status = mapProposalStatus(proposal)
  const executedAt =
    status === 'executed'
      ? typeof proposal.executedAt === 'string'
        ? proposal.executedAt
        : new Date().toISOString()
      : null

  return {
    legacy_id: legacyId,
    hackathon_id:
      coerceUuid(hackathonDbId) ??
      coerceUuid(proposal.hackathonDbId) ??
      null,
    onchain_proposal_id:
      coerceOnChainProposalId(proposal.onChainProposalId) ??
      coerceOnChainProposalId(proposal.onchain_proposal_id),
    status,
    created_by_wallet: (proposal.createdByWallet as string) || (proposal.created_by_wallet as string) || null,
    executed_at: executedAt,
    payload: proposal,
  }
}

function mapProposalStatus(proposal: Record<string, unknown>): string {
  if (proposal.status === 'executed' || proposal.executed) return 'executed'
  if (proposal.sponsorApproved) return 'sponsor_approved'
  if (proposal.status === 'cancelled') return 'cancelled'
  if (proposal.status === 'failed') return 'failed'
  if (proposal.status === 'awaiting_sponsor') return 'proposed'
  return 'proposed'
}

function coerceOnChainProposalId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export async function ensureOrganizer(
  supabase: ReturnType<typeof import('./server').createSupabaseServerClient>,
  wallet: string,
  name?: string,
  email?: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('organizers')
    .select('id, name, email')
    .eq('admin_wallet_address', wallet)
    .maybeSingle()

  if (existing?.id) {
    const patch: Record<string, string> = {}
    if (name?.trim()) patch.name = name.trim()
    if (email?.trim()) patch.email = email.trim()
    if (Object.keys(patch).length > 0) {
      await supabase.from('organizers').update(patch).eq('id', existing.id)
    }
    return existing.id
  }

  const { data, error } = await supabase
    .from('organizers')
    .insert({
      admin_wallet_address: wallet,
      name: name?.trim() || 'Organizer',
      email: email?.trim() || null,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function ensureSponsor(
  supabase: ReturnType<typeof import('./server').createSupabaseServerClient>,
  wallet: string,
  name?: string,
  email?: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('sponsors')
    .select('id, company_name, contact_email')
    .eq('funding_wallet_address', wallet)
    .maybeSingle()

  if (existing?.id) {
    const patch: Record<string, string> = {}
    if (name?.trim()) patch.company_name = name.trim()
    if (email?.trim()) patch.contact_email = email.trim()
    if (Object.keys(patch).length > 0) {
      await supabase.from('sponsors').update(patch).eq('id', existing.id)
    }
    return existing.id
  }

  const { data, error } = await supabase
    .from('sponsors')
    .insert({
      funding_wallet_address: wallet,
      company_name: name?.trim() || 'Sponsor',
      contact_email: email?.trim() || null,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function ensureParticipant(
  supabase: ReturnType<typeof import('./server').createSupabaseServerClient>,
  wallet: string,
  name?: string,
  email?: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('participants')
    .select('id, full_name, email')
    .eq('payout_wallet_address', wallet)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing?.id) {
    const patch: Record<string, string> = {}
    if (name?.trim()) patch.full_name = name.trim()
    if (email?.trim()) patch.email = email.trim()
    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await supabase
        .from('participants')
        .update(patch)
        .eq('id', existing.id)
      if (updateError) throw updateError
    }
    return existing.id
  }

  const { data, error } = await supabase
    .from('participants')
    .insert({
      payout_wallet_address: wallet,
      full_name: name?.trim() || 'Participant',
      email: email?.trim() || null,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function ensureEscrowForHackathon(
  supabase: ReturnType<typeof import('./server').createSupabaseServerClient>,
  hackathonId: string,
  organizerWallet: string,
  contractId?: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from('escrows')
    .select('id')
    .eq('hackathon_id', hackathonId)
    .maybeSingle()

  if (existing) return

  await supabase.from('escrows').insert({
    hackathon_id: hackathonId,
    organizer_wallet: organizerWallet,
    contract_id: contractId || INR_VAULT_ID,
    token_contract_id: 'INR',
    status: 'awaiting_funds',
  })
}
