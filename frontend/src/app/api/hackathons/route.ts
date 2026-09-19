import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db/server'
import { databaseSourceLabel, isDatabaseConfigured } from '@/lib/aws/dbReady'
import {
  ensureEscrowForHackathon,
  ensureOrganizer,
  hackathonToRow,
  rowToHackathon,
} from '@/lib/db/mappers'
import type { Hackathon } from '@/client/types/hackathon'
import { dropLegacyStellarHackathons } from '@/client/utils/legacyWeb3Data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ hackathons: [], source: 'none' })
  }

  try {
    const { searchParams } = new URL(request.url)
    const organizer = searchParams.get('organizer')?.trim()
    const sponsor = searchParams.get('sponsor')?.trim()

    const supabase = createSupabaseServerClient()
    let query = supabase.from('hackathons').select('*').order('created_at', { ascending: false })

    if (organizer) query = query.eq('organizer_wallet', organizer)
    if (sponsor) query = query.eq('sponsor_wallet', sponsor)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message, hackathons: [] }, { status: 500 })
    }

    const hackathons = dropLegacyStellarHackathons(
      (data || []).map((row: Parameters<typeof rowToHackathon>[0]) => rowToHackathon(row)),
    )
    return NextResponse.json({ hackathons, source: databaseSourceLabel() })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load hackathons'
    return NextResponse.json({ error: message, hackathons: [] }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: 'DYNAMODB_TABLE_NAME is not configured' },
      { status: 503 },
    )
  }

  try {
    const body = (await request.json()) as Hackathon & {
      sponsorFundingXlm?: number
      onChainBalanceXlm?: number
    }

    if (!body?.name || !body?.organizerAddress) {
      return NextResponse.json(
        { success: false, error: 'name and organizerAddress are required' },
        { status: 400 },
      )
    }

    const supabase = createSupabaseServerClient()
    const organizerId = await ensureOrganizer(supabase, body.organizerAddress.trim())

    const row = hackathonToRow(body, organizerId)
    const { data, error } = await supabase.from('hackathons').insert(row).select('*').single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    await ensureEscrowForHackathon(
      supabase,
      (data as { id: string }).id,
      body.organizerAddress,
      body.escrowAddress,
    )

    return NextResponse.json({
      success: true,
      hackathon: rowToHackathon(data as Parameters<typeof rowToHackathon>[0]),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create hackathon'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
