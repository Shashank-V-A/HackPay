import { getActiveDataBackend, isRdsConfigured } from '@/lib/aws/env'

export function isDatabaseConfigured(): boolean {
  return isRdsConfigured()
}

export function databaseSourceLabel(): 'rds' | 'none' {
  return getActiveDataBackend()
}
