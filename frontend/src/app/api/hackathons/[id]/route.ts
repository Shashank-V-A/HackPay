import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDatabaseConfigured } from '@/lib/aws/dbReady'
import { hackathonToRow, rowToHackathon } from '@/lib/supabase/mappers'
import { syncHackathonParticipantRoster } from '@/lib/supabase/syncParticipantRoster'
import { findHackathonById } from '@/lib/supabase/registerParticipant'
import type { Hackathon, Participant } from '@/client/types/hackathon'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

async function findHackathon(supabase: ReturnType<typeof createSupabaseServerClient>, id: string) {
  const { data, error } = await findHackathonById(supabase, id)
  return { data, error }
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const supabase = createSupabaseServerClient()
  const { data, error } = await findHackathon(supabase, id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ hackathon: rowToHackathon(data) })
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = (await request.json()) as Partial<
      Hackathon & { sponsorFundingXlm?: number; onChainBalanceXlm?: number }
    >

    const supabase = createSupabaseServerClient()
    const { data: existing, error: findError } = await findHackathon(supabase, id)
    if (findError) return NextResponse.json({ success: false, error: findError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    const merged = {
      ...rowToHackathon(existing),
      ...body,
      id: existing.legacy_id || existing.id,
      dbId: existing.id,
    }

    if (Array.isArray(body.participants)) {
      await syncHackathonParticipantRoster(
        supabase,
        existing.id,
        body.participants as Participant[],
      )
    }

    const row = hackathonToRow(merged, existing.organizer_id)
    delete (row as { legacy_id?: string }).legacy_id

    const { data, error } = await supabase
      .from('hackathons')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })

    return NextResponse.json({ success: true, hackathon: rowToHackathon(data) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const organizer = searchParams.get('organizer')?.trim()

  const supabase = createSupabaseServerClient()
  const { data: existing, error: findError } = await findHackathon(supabase, id)
  if (findError) {
    return NextResponse.json({ success: false, error: findError.message }, { status: 500 })
  }
  if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  if (
    organizer &&
    existing.organizer_wallet?.toLowerCase() !== organizer.toLowerCase()
  ) {
    return NextResponse.json(
      { success: false, error: 'Only the organizer can delete this hackathon' },
      { status: 403 },
    )
  }

  const { error } = await supabase.from('hackathons').delete().eq('id', existing.id)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
