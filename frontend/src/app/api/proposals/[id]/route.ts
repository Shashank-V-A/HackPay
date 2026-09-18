import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isDatabaseConfigured } from '@/lib/aws/dbReady'
import { proposalToRow, rowToProposal } from '@/lib/supabase/mappers'
import { syncExecutedPayouts } from '@/lib/supabase/syncExecutedPayouts'
import { isUuid } from '@/lib/supabase/ids'
import { errorMessage, formatSupabaseApiError } from '@/lib/supabase/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

async function findProposal(supabase: ReturnType<typeof createSupabaseServerClient>, id: string) {
  const key = id.trim()
  const byLegacy = await supabase.from('proposals').select('*').eq('legacy_id', key).maybeSingle()
  if (byLegacy.data) return byLegacy
  if (byLegacy.error) return byLegacy
  if (!isUuid(key)) return { data: null, error: null }
  return supabase.from('proposals').select('*').eq('id', key).maybeSingle()
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 })
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    const supabase = createSupabaseServerClient()
    const { data: existing, error: findError } = await findProposal(supabase, id)
    if (findError) return NextResponse.json({ success: false, error: findError.message }, { status: 500 })
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    const merged = { ...rowToProposal(existing), ...body, id: existing.legacy_id || existing.id }
    const row = proposalToRow(merged, existing.hackathon_id)
    delete (row as { legacy_id?: string }).legacy_id

    const { data, error } = await supabase
      .from('proposals')
      .update(row)
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })

    await syncExecutedPayouts(supabase, existing.id, merged)

    return NextResponse.json({ success: true, proposal: rowToProposal(data) })
  } catch (err) {
    const message = formatSupabaseApiError('Update failed', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
