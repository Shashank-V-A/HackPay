import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(root, '..')

loadEnv({ path: path.resolve(repoRoot, '.env') })
loadEnv({ path: path.resolve(root, '.env') })
loadEnv({ path: path.resolve(root, '.env.local') })

const table = process.env.DYNAMODB_TABLE_NAME?.trim() || process.env.HACKPAY_TABLE_NAME?.trim()
if (!table) {
  console.error('[aws-env] DYNAMODB_TABLE_NAME is required. See AWS.md / .env.example')
  process.exit(1)
}

const cognito =
  Boolean(process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim()) &&
  Boolean(process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID?.trim())

console.log(
  `[aws-env] OK table=${table} cognito=${cognito ? 'yes' : 'no'} region=${process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION || 'ap-south-1'}`,
)
