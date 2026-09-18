/**
 * Minimal Postgres query builder that mirrors the Supabase JS patterns
 * used across HackPay API routes (select / insert / update / delete / upsert).
 */
import pg from 'pg'
import { getDatabaseUrl } from '@/lib/aws/env'

type Row = Record<string, unknown>

type Filter = { column: string; op: 'eq' | 'neq'; value: unknown }

export type DbResult<T = Row> = {
  data: T | T[] | null
  error: { message: string } | null
}

let pool: pg.Pool | null = null

export function getPgPool(): pg.Pool {
  if (pool) return pool
  const connectionString = getDatabaseUrl()
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  pool = new pg.Pool({
    connectionString: connectionString.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: { rejectUnauthorized: false },
    max: 5,
  })
  return pool
}

function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`)
  }
  return `"${name}"`
}

class QueryBuilder<T extends Row = Row> {
  private table: string
  private filters: Filter[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private payload: Row | Row[] | null = null
  private returning = false
  private conflictCols: string[] = []

  constructor(table: string) {
    this.table = table
  }

  select(_cols = '*'): this {
    this.returning = true
    if (this.mode !== 'insert' && this.mode !== 'update' && this.mode !== 'upsert' && this.mode !== 'delete') {
      this.mode = 'select'
    }
    return this
  }

  insert(row: Row | Row[]): this {
    this.mode = 'insert'
    this.payload = row
    return this
  }

  update(row: Row): this {
    this.mode = 'update'
    this.payload = row
    return this
  }

  delete(): this {
    this.mode = 'delete'
    return this
  }

  upsert(row: Row | Row[], opts?: { onConflict?: string }): this {
    this.mode = 'upsert'
    this.payload = row
    this.conflictCols = (opts?.onConflict || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'eq', value })
    return this
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: 'neq', value })
    return this
  }

  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderCol = column
    this.orderAsc = opts?.ascending !== false
    return this
  }

  limit(n: number): this {
    this.limitN = n
    return this
  }

  private whereClause(startIndex: number): { sql: string; params: unknown[] } {
    if (!this.filters.length) return { sql: '', params: [] }
    const params: unknown[] = []
    const parts = this.filters.map((f, i) => {
      params.push(f.value)
      const op = f.op === 'eq' ? '=' : '<>'
      return `${quoteIdent(f.column)} ${op} $${startIndex + i}`
    })
    return { sql: ` WHERE ${parts.join(' AND ')}`, params }
  }

  async maybeSingle(): Promise<DbResult<T>> {
    this.limitN = 1
    const res = await this.execute()
    if (res.error) return { data: null, error: res.error }
    const rows = Array.isArray(res.data) ? res.data : res.data ? [res.data] : []
    return { data: (rows[0] as T) || null, error: null }
  }

  async single(): Promise<DbResult<T>> {
    const res = await this.maybeSingle()
    if (res.error) return res
    if (!res.data) return { data: null, error: { message: 'No rows returned' } }
    return res
  }

  then<TResult1 = DbResult<T>, TResult2 = never>(
    onfulfilled?: ((value: DbResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<DbResult<T>> {
    const client = getPgPool()
    try {
      if (this.mode === 'select') {
        const { sql: where, params } = this.whereClause(1)
        let sql = `SELECT * FROM ${quoteIdent(this.table)}${where}`
        if (this.orderCol) {
          sql += ` ORDER BY ${quoteIdent(this.orderCol)} ${this.orderAsc ? 'ASC' : 'DESC'}`
        }
        if (this.limitN != null) {
          sql += ` LIMIT ${Number(this.limitN)}`
        }
        const result = await client.query(sql, params)
        return { data: result.rows as T[], error: null }
      }

      if (this.mode === 'insert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload!]
        const keys = Object.keys(rows[0])
        const cols = keys.map(quoteIdent).join(', ')
        const params: unknown[] = []
        const valueGroups = rows.map((row, ri) => {
          const placeholders = keys.map((k, ki) => {
            params.push(row[k])
            return `$${ri * keys.length + ki + 1}`
          })
          return `(${placeholders.join(', ')})`
        })
        const sql = `INSERT INTO ${quoteIdent(this.table)} (${cols}) VALUES ${valueGroups.join(', ')} RETURNING *`
        const result = await client.query(sql, params)
        const data = Array.isArray(this.payload) ? (result.rows as T[]) : (result.rows[0] as T)
        return { data, error: null }
      }

      if (this.mode === 'update') {
        const row = this.payload as Row
        const keys = Object.keys(row)
        const params: unknown[] = []
        const sets = keys.map((k, i) => {
          params.push(row[k])
          return `${quoteIdent(k)} = $${i + 1}`
        })
        const { sql: where, params: whereParams } = this.whereClause(params.length + 1)
        params.push(...whereParams)
        const sql = `UPDATE ${quoteIdent(this.table)} SET ${sets.join(', ')}${where} RETURNING *`
        const result = await client.query(sql, params)
        return { data: result.rows as T[], error: null }
      }

      if (this.mode === 'delete') {
        const { sql: where, params } = this.whereClause(1)
        const sql = `DELETE FROM ${quoteIdent(this.table)}${where} RETURNING *`
        const result = await client.query(sql, params)
        return { data: result.rows as T[], error: null }
      }

      if (this.mode === 'upsert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload!]
        const keys = Object.keys(rows[0])
        const cols = keys.map(quoteIdent).join(', ')
        const params: unknown[] = []
        const valueGroups = rows.map((row, ri) => {
          const placeholders = keys.map((k, ki) => {
            params.push(row[k])
            return `$${ri * keys.length + ki + 1}`
          })
          return `(${placeholders.join(', ')})`
        })
        const conflict =
          this.conflictCols.length > 0
            ? this.conflictCols.map(quoteIdent).join(', ')
            : quoteIdent(keys[0])
        const updates = keys
          .filter((k) => !this.conflictCols.includes(k))
          .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
          .join(', ')
        const sql = `INSERT INTO ${quoteIdent(this.table)} (${cols}) VALUES ${valueGroups.join(', ')}
          ON CONFLICT (${conflict}) DO UPDATE SET ${updates || `${quoteIdent(keys[0])} = EXCLUDED.${quoteIdent(keys[0])}`}
          RETURNING *`
        const result = await client.query(sql, params)
        const data = Array.isArray(this.payload) ? (result.rows as T[]) : (result.rows[0] as T)
        return { data, error: null }
      }

      return { data: null, error: { message: 'Unknown query mode' } }
    } catch (err) {
      return {
        data: null,
        error: { message: err instanceof Error ? err.message : 'Query failed' },
      }
    }
  }
}

export type DataClient = {
  from: (table: string) => QueryBuilder
}

export function createRdsDataClient(): DataClient {
  return {
    from(table: string) {
      return new QueryBuilder(table)
    },
  }
}
