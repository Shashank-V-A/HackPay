import { createDataClient, type HackPayDataClient } from '@/lib/aws/dataClient'

/** Server data client — RDS when DATABASE_URL is set, otherwise Supabase. */
export function createSupabaseServerClient(): HackPayDataClient {
  return createDataClient()
}
