import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(root, '..')

loadEnv({ path: path.resolve(repoRoot, '.env') })
loadEnv({ path: path.resolve(root, '.env') })
loadEnv({ path: path.resolve(root, '.env.local') })

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('[aws-env] DATABASE_URL is required (Amazon RDS). See AWS.md / .env.example')
  process.exit(1)
}

const cognito =
  Boolean(process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim()) &&
  Boolean(process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim())

console.log(
  `[aws-env] OK DATABASE_URL set cognito=${cognito ? 'yes' : 'no'} region=${process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'ap-south-1'}`,
)
