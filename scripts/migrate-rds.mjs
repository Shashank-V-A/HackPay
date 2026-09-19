#!/usr/bin/env node
/**
 * Apply HackPay SQL migrations to AWS RDS Postgres.
 * Usage: DATABASE_URL=postgresql://... node scripts/migrate-rds.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sqlDir = path.resolve(__dirname, '../infra/sql')

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error('Set DATABASE_URL to your RDS connection string.')
  process.exit(1)
}

const files = [
  '000_rds_bootstrap.sql',
  '000b_rds_roles.sql',
  '001_prizevault_schema.sql',
  '002_participants_rls.sql',
  '003_payouts_rls.sql',
  '004_tighten_rls.sql',
  '005_participant_profile.sql',
]

const client = new pg.Client({
  connectionString: databaseUrl.replace(/[?&]sslmode=[^&]*/g, ''),
  ssl: { rejectUnauthorized: false },
})

await client.connect()
console.log('Connected. Applying migrations…')

for (const file of files) {
  const full = path.join(sqlDir, file)
  if (!fs.existsSync(full)) {
    console.warn('Skip missing', file)
    continue
  }
  const sql = fs.readFileSync(full, 'utf8')
  console.log('→', file)
  await client.query(sql)
}

await client.end()
console.log('Done. RDS schema is ready.')
