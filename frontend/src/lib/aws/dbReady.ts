import { isRdsConfigured } from '@/lib/aws/env'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { getActiveDataBackend } from '@/lib/aws/env'

export function isDatabaseConfigured(): boolean {
  return isRdsConfigured() || isSupabaseConfigured()
}

export function databaseSourceLabel(): 'rds' | 'supabase' | 'none' {
  return getActiveDataBackend()
}
