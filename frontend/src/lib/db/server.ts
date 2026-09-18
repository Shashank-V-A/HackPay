import { createDataClient, type HackPayDataClient } from '@/lib/aws/dataClient'

/** Server data client — Amazon RDS Postgres. */
export function createDataServerClient(): HackPayDataClient {
  return createDataClient()
}

/** @deprecated Prefer createDataServerClient */
export function createSupabaseServerClient(): HackPayDataClient {
  return createDataClient()
}
