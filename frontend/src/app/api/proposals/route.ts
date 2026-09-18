import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDatabaseConfigured } from '@/lib/aws/dbReady'
import { proposalToRow, rowToProposal } from '@/lib/supabase/mappers'
import { syncExecutedPayouts } from '@/lib/supabase/syncExecutedPayouts'
import { coerceUuid } from '@/lib/supabase/ids'
import { findHackathonById } from '@/lib/supabase/registerParticipant'
import { errorMessage, formatSupabaseApiError } from '@/lib/supabase/errors'
import { dropLegacyStellarProposals } from '@/client/utils/legacyWeb3Data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SupabaseClient = ReturnType<typeof createSupabaseServerClient>

async function resolveHackathonDbId(
  supabase: SupabaseClient,
  proposal: Record<string, unknown>,
  existingHackathonId?: string | null,
): Promise<string | null> {
  const existing = coerceUuid(existingHackathonId ?? '')
  if (existing) return existing

  const fromProposal = coerceUuid(proposal.hackathonDbId)
  if (fromProposal) return fromProposal

  const hackathonKey = String(proposal.hackathonId || '').trim()
  if (!hackathonKey) return null

  const { data, error } = await findHackathonById(supabase, hackathonKey)
  if (error) throw error
  return data?.id ?? null
}

async function upsertProposal(
  supabase: SupabaseClient,
  proposal: Record<string, unknown>,
): Promise<string> {
  const legacyId = String(proposal.id || '').trim()
  if (!legacyId) {
    throw new Error('Proposal is missing an id')
  }

  const { data: existing, error: findError } = await supabase
    .from('proposals')
    .select('id, hackathon_id')
    .eq('legacy_id', legacyId)
    .maybeSingle()

  if (findError) throw findError

  const hackathonDbId = await resolveHackathonDbId(
    supabase,
    proposal,
    existing?.hackathon_id,
  )
  const row = proposalToRow(proposal, hackathonDbId)

  let proposalDbId = existing?.id as string | undefined

  if (existing) {
    delete (row as { legacy_id?: string }).legacy_id
    const { error: updateError } = await supabase
      .from('proposals')
      .update(row)
      .eq('id', existing.id)
    if (updateError) throw updateError
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('proposals')
      .insert(row)
      .select('id')
      .single()
    if (insertError) throw insertError
    proposalDbId = inserted.id
  }

  if (!proposalDbId) {
    throw new Error(`Proposal ${legacyId} was not saved`)
  }

  return proposalDbId
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ proposals: [], source: 'none' })
  }

  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message, proposals: [] }, { status: 500 })
    }

    return NextResponse.json({
      proposals: dropLegacyStellarProposals(
        (data || []).map((row: Parameters<typeof rowToProposal>[0]) => rowToProposal(row)),
      ),
      source: 'supabase',
    })
  } catch (err) {
    const message = errorMessage(err, 'Failed to load proposals')
    return NextResponse.json({ error: message, proposals: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    const supabase = createSupabaseServerClient()
    const proposalDbId = await upsertProposal(supabase, body)
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalDbId)
      .single()

    if (error) throw error

    await syncExecutedPayouts(supabase, proposalDbId, body)

    return NextResponse.json({ success: true, proposal: rowToProposal(data) })
  } catch (err) {
    const message = formatSupabaseApiError('Failed to create proposal', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** Replace/sync full proposal list (mirrors localStorage bulk save). */
export async function PUT(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = (await request.json()) as { proposals?: Record<string, unknown>[] }
    const proposals = body.proposals
    if (!Array.isArray(proposals)) {
      return NextResponse.json({ success: false, error: 'proposals array required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    for (const proposal of proposals) {
      const legacyId = String(proposal.id || '').trim()
      if (!legacyId) continue

      try {
        const proposalDbId = await upsertProposal(supabase, proposal)
        await syncExecutedPayouts(supabase, proposalDbId, proposal)
      } catch (err) {
        throw new Error(formatSupabaseApiError(`Proposal ${legacyId} sync failed`, err))
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = errorMessage(err, 'Bulk save failed')
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
