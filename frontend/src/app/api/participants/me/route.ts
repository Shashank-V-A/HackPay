import { NextResponse } from 'next/server'
import { AuthError, requireAuthIfConfigured } from '@/lib/aws/auth'
import { isDatabaseConfigured } from '@/lib/aws/dbReady'
import { getActiveDataBackend } from '@/lib/aws/env'
import { createSupabaseServerClient } from '@/lib/db/server'
import { ensureParticipant } from '@/lib/db/mappers'
import {
  getParticipantProfileByWallet,
  updateParticipantProfile,
  type ParticipantProfileUpdate,
} from '@/lib/db/participantProfile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: 'DYNAMODB_TABLE_NAME is not configured' },
      { status: 503 },
    )
  }

  try {
    const url = new URL(request.url)
    const walletParam = url.searchParams.get('wallet')?.trim().toLowerCase()

    let auth: Awaited<ReturnType<typeof requireAuthIfConfigured>> = null
    try {
      auth = await requireAuthIfConfigured(request)
    } catch (err) {
      if (!(err instanceof AuthError) || !walletParam) throw err
    }

    const wallet = (auth?.email || walletParam || '').trim().toLowerCase()
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 })
    }

    const db = createSupabaseServerClient()
    let profile = await getParticipantProfileByWallet(db, wallet)
    if (!profile) {
      await ensureParticipant(db, wallet, auth?.name, auth?.email || wallet)
      profile = await getParticipantProfileByWallet(db, wallet)
    }

    return NextResponse.json({
      success: true,
      profile,
      dataBackend: getActiveDataBackend(),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Failed to load profile'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { success: false, error: 'DYNAMODB_TABLE_NAME is not configured' },
      { status: 503 },
    )
  }

  try {
    const body = (await request.json()) as ParticipantProfileUpdate & { wallet?: string }
    const walletParam = body.wallet?.trim().toLowerCase()

    let auth: Awaited<ReturnType<typeof requireAuthIfConfigured>> = null
    try {
      auth = await requireAuthIfConfigured(request)
    } catch (err) {
      if (!(err instanceof AuthError) || !walletParam) throw err
    }

    const wallet = (auth?.email || walletParam || '').trim().toLowerCase()
    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 })
    }

    const db = createSupabaseServerClient()
    let existing = await getParticipantProfileByWallet(db, wallet)
    if (!existing) {
      await ensureParticipant(db, wallet, body.fullName || auth?.name, auth?.email || wallet)
      existing = await getParticipantProfileByWallet(db, wallet)
    }
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Could not create profile row' }, { status: 500 })
    }

    const profile = await updateParticipantProfile(db, wallet, body)
    return NextResponse.json({
      success: true,
      profile,
      dataBackend: getActiveDataBackend(),
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Failed to save profile'
    const status = /taken|must be|must start/i.test(message) ? 400 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
