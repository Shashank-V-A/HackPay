/**
 * Unified data client — Amazon DynamoDB.
 */
import { isDynamoConfigured } from '@/lib/aws/env'
import { createDynamoDataClient } from '@/lib/aws/dynamo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HackPayDataClient = any

let cached: HackPayDataClient | null = null

export function getActiveDataBackend(): 'dynamodb' | 'none' {
  return isDynamoConfigured() ? 'dynamodb' : 'none'
}

export function createDataClient(): HackPayDataClient {
  if (!isDynamoConfigured()) {
    throw new Error('DYNAMODB_TABLE_NAME is not set. Deploy HackPayStack CDK (see AWS.md).')
  }
  if (!cached) cached = createDynamoDataClient()
  return cached
}

/** @deprecated Use createDataClient */
export function createSupabaseServerClient(): HackPayDataClient {
  return createDataClient()
}
