/**
 * DynamoDB data client — same fluent shape as the old Supabase/RDS helpers
 * (.from().select().eq().insert()…) so API routes keep working.
 *
 * Single-table design:
 *   pk = `${table}#${id}` (or composite for registrations/payouts)
 *   sk = META
 *   GSI1: entityType + created_at (list by table)
 *   GSI2: `${table}#${attr}#${value}` (lookups by unique/filter columns)
 */
import { randomUUID } from 'crypto'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { getAwsRegion, getDynamoTableName } from '@/lib/aws/env'

type Row = Record<string, unknown>
type Filter = { column: string; op: 'eq' | 'neq'; value: unknown }

export type DbResult<T = Row> = {
  data: T | T[] | null
  error: { message: string } | null
}

const META = 'META'
const INTERNAL = new Set(['pk', 'sk', 'entityType', 'gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk'])

/** Attribute used for GSI2 unique lookup (one per item). */
const UNIQUE_ATTR: Record<string, string> = {
  hackathons: 'legacy_id',
  organizers: 'admin_wallet_address',
  sponsors: 'funding_wallet_address',
  participants: 'payout_wallet_address',
  proposals: 'legacy_id',
  escrows: 'hackathon_id',
  payouts: 'id',
  hackathon_registrations: 'id',
  /** Composite: hackathon_id#wallet — see resolveId */
  repo_submissions: 'id',
}

let doc: DynamoDBDocumentClient | null = null

function client(): DynamoDBDocumentClient {
  if (!doc) {
    doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: getAwsRegion() }), {
      marshallOptions: { removeUndefinedValues: true },
    })
  }
  return doc
}

function tableName(): string {
  const name = getDynamoTableName()
  if (!name) throw new Error('DYNAMODB_TABLE_NAME is not set')
  return name
}

function publicRow(item: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(item)) {
    if (!INTERNAL.has(k)) out[k] = v
  }
  return out
}

function makePk(table: string, id: string): string {
  return `${table}#${id}`
}

function compositePk(table: string, parts: string[]): string {
  return `${table}#${parts.join('#')}`
}

function gsi2(table: string, attr: string, value: unknown): { gsi2pk: string; gsi2sk: string } | null {
  if (value === null || value === undefined || value === '') return null
  return { gsi2pk: `${table}#${attr}#${String(value)}`, gsi2sk: META }
}

function resolveId(table: string, row: Row, conflictCols: string[]): string {
  if (table === 'hackathon_registrations' && row.hackathon_id && row.wallet_address) {
    return `${row.hackathon_id}#${row.wallet_address}`
  }
  if (table === 'repo_submissions' && row.hackathon_id && row.wallet_address) {
    return `${row.hackathon_id}#${String(row.wallet_address).toLowerCase()}`
  }
  if (table === 'payouts' && row.proposal_id && row.winner_wallet) {
    return `${row.proposal_id}#${row.winner_wallet}`
  }
  if (conflictCols.length === 1 && row[conflictCols[0]] != null) {
    return String(row[conflictCols[0]])
  }
  if (conflictCols.length > 1) {
    return conflictCols.map((c) => String(row[c] ?? '')).join('#')
  }
  if (row.id) return String(row.id)
  return randomUUID()
}

function buildItem(table: string, row: Row, conflictCols: string[] = []): Row {
  const id = resolveId(table, row, conflictCols)
  const created = (row.created_at as string) || new Date().toISOString()
  const item: Row = {
    ...row,
    id,
    created_at: created,
    updated_at: (row.updated_at as string) || created,
    pk: makePk(table, id),
    sk: META,
    entityType: table,
    gsi1pk: table,
    gsi1sk: created,
  }

  // GSI2 for the table's unique natural key (legacy id / wallet / etc.)
  const uniqueAttr = UNIQUE_ATTR[table]
  if (uniqueAttr && item[uniqueAttr] != null && item[uniqueAttr] !== '') {
    Object.assign(item, gsi2(table, uniqueAttr, item[uniqueAttr]))
  } else {
    const key = gsi2(table, 'id', id)
    if (key) Object.assign(item, key)
  }

  return item
}

class QueryBuilder<T extends Row = Row> {
  private table: string
  private filters: Filter[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private payload: Row | Row[] | null = null
  private conflictCols: string[] = []

  constructor(table: string) {
    this.table = table
  }

  select(_cols = '*'): this {
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

  private eqFilter(column: string): Filter | undefined {
    return this.filters.find((f) => f.op === 'eq' && f.column === column)
  }

  private async execute(): Promise<DbResult<T>> {
    try {
      if (this.mode === 'select') return this.runSelect()
      if (this.mode === 'insert') return this.runInsert(false)
      if (this.mode === 'upsert') return this.runInsert(true)
      if (this.mode === 'update') return this.runUpdate()
      if (this.mode === 'delete') return this.runDelete()
      return { data: null, error: { message: 'Unknown query mode' } }
    } catch (err) {
      return {
        data: null,
        error: { message: err instanceof Error ? err.message : 'DynamoDB query failed' },
      }
    }
  }

  private async runSelect(): Promise<DbResult<T>> {
    const idEq = this.eqFilter('id')
    if (idEq && this.filters.length === 1) {
      const res = await client().send(
        new GetCommand({
          TableName: tableName(),
          Key: { pk: makePk(this.table, String(idEq.value)), sk: META },
        }),
      )
      const row = res.Item ? publicRow(res.Item) : null
      return { data: row as T | null, error: null }
    }

    // Prefer GSI2 when filtering by the table's unique attribute
    const eqFilters = this.filters.filter((f) => f.op === 'eq')
    const uniqueAttr = UNIQUE_ATTR[this.table]
    if (eqFilters.length === 1 && uniqueAttr && eqFilters[0].column === uniqueAttr) {
      const f = eqFilters[0]
      const key = gsi2(this.table, f.column, f.value)
      if (key) {
        const res = await client().send(
          new QueryCommand({
            TableName: tableName(),
            IndexName: 'GSI2',
            KeyConditionExpression: 'gsi2pk = :pk AND gsi2sk = :sk',
            ExpressionAttributeValues: { ':pk': key.gsi2pk, ':sk': META },
            Limit: this.limitN ?? undefined,
          }),
        )
        let rows = (res.Items || []).map(publicRow)
        rows = this.applyNeqAndSort(rows)
        return { data: rows as T[], error: null }
      }
    }

    // List entity type via GSI1, then apply remaining filters in memory
    const res = await client().send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI1',
        KeyConditionExpression: 'gsi1pk = :t',
        ExpressionAttributeValues: { ':t': this.table },
        ScanIndexForward: this.orderCol === 'created_at' ? this.orderAsc : true,
      }),
    )
    let rows = (res.Items || []).map(publicRow)
    rows = this.applyFilters(rows)
    rows = this.applyNeqAndSort(rows)
    if (this.limitN != null) rows = rows.slice(0, this.limitN)
    return { data: rows as T[], error: null }
  }

  private applyFilters(rows: Row[]): Row[] {
    return rows.filter((row) =>
      this.filters.every((f) => {
        const v = row[f.column]
        if (f.op === 'eq') return String(v) === String(f.value)
        return String(v) !== String(f.value)
      }),
    )
  }

  private applyNeqAndSort(rows: Row[]): Row[] {
    let out = rows
    const neq = this.filters.filter((f) => f.op === 'neq')
    if (neq.length) {
      out = out.filter((row) => neq.every((f) => String(row[f.column]) !== String(f.value)))
    }
    if (this.orderCol) {
      const col = this.orderCol
      const asc = this.orderAsc
      out = [...out].sort((a, b) => {
        const av = String(a[col] ?? '')
        const bv = String(b[col] ?? '')
        return asc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    return out
  }

  private async runInsert(isUpsert: boolean): Promise<DbResult<T>> {
    const rows = Array.isArray(this.payload) ? this.payload : [this.payload!]
    const saved: Row[] = []
    for (const row of rows) {
      // Upsert by conflict: find existing via GSI2 if needed
      if (isUpsert && this.conflictCols.length) {
        if (this.conflictCols.length === 1) {
          const col = this.conflictCols[0]
          const existing = await this.findByAttr(col, row[col])
          if (existing?.id) {
            row.id = existing.id
          }
        } else if (
          this.table === 'hackathon_registrations' ||
          this.table === 'payouts'
        ) {
          // composite pk already used in resolveId
        } else {
          // try first conflict attr
          const col = this.conflictCols[0]
          const existing = await this.findByAttr(col, row[col])
          if (existing?.id) row.id = existing.id
        }
      }

      const item = buildItem(this.table, row, this.conflictCols)
      await client().send(
        new PutCommand({
          TableName: tableName(),
          Item: item,
          ...(isUpsert
            ? {}
            : {
                ConditionExpression: 'attribute_not_exists(pk)',
              }),
        }),
      )
      saved.push(publicRow(item))
    }
    const data = Array.isArray(this.payload) ? saved : saved[0]
    return { data: data as T | T[], error: null }
  }

  private async findByAttr(attr: string, value: unknown): Promise<Row | null> {
    const key = gsi2(this.table, attr, value)
    if (!key) return null
    const res = await client().send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI2',
        KeyConditionExpression: 'gsi2pk = :pk AND gsi2sk = :sk',
        ExpressionAttributeValues: { ':pk': key.gsi2pk, ':sk': META },
        Limit: 1,
      }),
    )
    return res.Items?.[0] ? publicRow(res.Items[0]) : null
  }

  private async runUpdate(): Promise<DbResult<T>> {
    const idEq = this.eqFilter('id')
    const legacyEq = this.eqFilter('legacy_id')
    let existing: Row | null = null

    if (idEq) {
      const res = await client().send(
        new GetCommand({
          TableName: tableName(),
          Key: { pk: makePk(this.table, String(idEq.value)), sk: META },
        }),
      )
      existing = res.Item ? publicRow(res.Item) : null
    } else if (legacyEq) {
      existing = await this.findByAttr('legacy_id', legacyEq.value)
    } else if (this.filters.length) {
      // fallback: query then filter
      const listed = await this.runSelect()
      const rows = Array.isArray(listed.data) ? listed.data : listed.data ? [listed.data] : []
      existing = (rows[0] as Row) || null
    }

    if (!existing?.id) {
      return { data: [], error: null }
    }

    const merged = {
      ...existing,
      ...(this.payload as Row),
      id: existing.id,
      updated_at: new Date().toISOString(),
    }
    const item = buildItem(this.table, merged)
    await client().send(new PutCommand({ TableName: tableName(), Item: item }))
    return { data: [publicRow(item)] as T[], error: null }
  }

  private async runDelete(): Promise<DbResult<T>> {
    const idEq = this.eqFilter('id')
    if (!idEq) {
      return { data: null, error: { message: 'delete requires eq(id)' } }
    }
    const key = { pk: makePk(this.table, String(idEq.value)), sk: META }
    const existing = await client().send(new GetCommand({ TableName: tableName(), Key: key }))
    await client().send(new DeleteCommand({ TableName: tableName(), Key: key }))
    const row = existing.Item ? publicRow(existing.Item) : null
    return { data: row ? ([row] as T[]) : [], error: null }
  }
}

export type DataClient = {
  from: (table: string) => QueryBuilder
}

export function createDynamoDataClient(): DataClient {
  // Touch table name early so misconfig fails clearly
  tableName()
  return {
    from(table: string) {
      return new QueryBuilder(table)
    },
  }
}

/** Health helper — verifies table is reachable. */
export async function pingDynamoTable(): Promise<boolean> {
  try {
    await client().send(
      new ScanCommand({
        TableName: tableName(),
        Limit: 1,
      }),
    )
    return true
  } catch {
    return false
  }
}
