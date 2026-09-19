import { getActiveDataBackend, isDynamoConfigured } from '@/lib/aws/env'

export function isDatabaseConfigured(): boolean {
  return isDynamoConfigured()
}

export function databaseSourceLabel(): 'dynamodb' | 'none' {
  return getActiveDataBackend()
}
