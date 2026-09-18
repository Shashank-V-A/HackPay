import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(root, '..')

loadEnv({ path: path.resolve(repoRoot, '.env') })
loadEnv({ path: path.resolve(root, '.env') })
loadEnv({ path: path.resolve(root, '.env.local') })

const hasRds = Boolean(process.env.DATABASE_URL?.trim())
if (hasRds) {
  console.log('[db-env] OK DATABASE_URL set (AWS RDS)')
  process.exit(0)
}

const DEFAULT_URL = 'https://mjlbcskcsrxkjycjpdyh.supabase.co'
const DEFAULT_KEY = 'sb_publishable_jM9a3lNktIjheG6joFKvYw_G8PcKjPx'

const url = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  DEFAULT_URL
).trim()

const key = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_KEY
).trim()

const fromEnv =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()) &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  )

if (!url || !key) {
  console.error('[db-env] Missing DATABASE_URL (RDS) or Supabase URL/key.')
  process.exit(1)
}

console.log(`[db-env] OK supabase url=${url} source=${fromEnv ? 'env' : 'project-default'}`)
