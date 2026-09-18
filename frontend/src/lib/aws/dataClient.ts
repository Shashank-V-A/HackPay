/**
 * Unified data client: AWS RDS (preferred when DATABASE_URL is set) or Supabase.
 * Typed loosely so existing mapper/API code keeps working across both backends.
 */
import { createClient } from '@supabase/supabase-js'
import { getDataBackend, isRdsConfigured } from '@/lib/aws/env'
import { createRdsDataClient } from '@/lib/aws/rds'
import {
  getSupabasePublishableKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from '@/lib/supabase/env'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HackPayDataClient = any

let cached: HackPayDataClient | null = null
let cachedBackend: 'rds' | 'supabase' | null = null

export function getActiveDataBackend(): 'rds' | 'supabase' | 'none' {
  if (isRdsConfigured()) return 'rds'
  if (isSupabaseConfigured()) return 'supabase'
  return getDataBackend()
}

export function createDataClient(): HackPayDataClient {
  const backend = getActiveDataBackend()
  if (cached && cachedBackend === backend) return cached

  if (backend === 'rds') {
    cached = createRdsDataClient()
    cachedBackend = 'rds'
    return cached
  }

  if (!isSupabaseConfigured()) {
    throw new Error(
      'No database configured. Set DATABASE_URL (RDS) or NEXT_PUBLIC_SUPABASE_URL + keys.',
    )
  }

  const serviceKey = getSupabaseServiceRoleKey()
  const key = serviceKey || getSupabasePublishableKey()
  cached = createClient(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  cachedBackend = 'supabase'
  return cached
}

/** @deprecated Prefer createDataClient — kept for gradual migration. */
export function createSupabaseServerClient(): HackPayDataClient {
  return createDataClient()
}
