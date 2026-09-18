/**
 * Unified data client — AWS RDS only (Ship It).
 */
import { isRdsConfigured } from '@/lib/aws/env'
import { createRdsDataClient } from '@/lib/aws/rds'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HackPayDataClient = any

let cached: HackPayDataClient | null = null

export function getActiveDataBackend(): 'rds' | 'none' {
  return isRdsConfigured() ? 'rds' : 'none'
}

export function createDataClient(): HackPayDataClient {
  if (!isRdsConfigured()) {
    throw new Error('DATABASE_URL is not set. Configure AWS RDS (see AWS.md).')
  }
  if (!cached) cached = createRdsDataClient()
  return cached
}

/** @deprecated Use createDataClient */
export function createSupabaseServerClient(): HackPayDataClient {
  return createDataClient()
}
