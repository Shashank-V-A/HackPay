import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getActiveDataBackend, isRdsConfigured } from '@/lib/aws/env'
import { AuthError, requireAuthIfConfigured } from '@/lib/aws/auth'
import {
  ensureOrganizer,
  ensureParticipant,
  ensureSponsor,
} from '@/lib/supabase/mappers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SyncBody = {
  wallet?: string
  role?: 'organizer' | 'sponsor' | 'participant'
  name?: string
  email?: string
}

export async function POST(request: Request) {
  const backend = getActiveDataBackend()
  if (backend === 'none' || (backend === 'supabase' && !isSupabaseConfigured() && !isRdsConfigured())) {
    if (!isRdsConfigured() && !isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Database is not configured (set DATABASE_URL or Supabase)' },
        { status: 503 },
      )
    }
  }

  try {
    const auth = await requireAuthIfConfigured(request)
    const body = (await request.json()) as SyncBody

    const wallet = (auth?.email || body.wallet || '').trim().toLowerCase()
    const role = auth?.role || body.role
    const name = auth?.name || body.name
    const email = auth?.email || body.email || wallet

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'wallet is required' }, { status: 400 })
    }
    if (role !== 'organizer' && role !== 'sponsor' && role !== 'participant') {
      return NextResponse.json({ success: false, error: 'valid role is required' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()
    let profileId: string

    if (role === 'organizer') {
      profileId = await ensureOrganizer(supabase, wallet, name, email)
    } else if (role === 'sponsor') {
      profileId = await ensureSponsor(supabase, wallet, name, email)
    } else {
      profileId = await ensureParticipant(supabase, wallet, name, email)
    }

    return NextResponse.json({
      success: true,
      role,
      profileId,
      auth: auth ? 'cognito' : 'local',
      dataBackend: getActiveDataBackend(),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Session sync failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
