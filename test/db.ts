import { PGlite, type Transaction } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

export const BRAND_A = '11111111-1111-4111-8111-111111111111' // Northlight Prints
export const BRAND_B = '22222222-2222-4222-8222-222222222222' // Studio Verde
export const A_CUSTOMER = 'aaaaaaaa-0000-4000-8000-000000000001'
export const A_CUSTOMER_2 = 'aaaaaaaa-0000-4000-8000-000000000002'
export const A_STAFF = 'aaaaaaaa-0000-4000-8000-000000000003'
export const B_CUSTOMER = 'bbbbbbbb-0000-4000-8000-000000000001'
export const B_STAFF = 'bbbbbbbb-0000-4000-8000-000000000002'

export const PRINT_A = '1a000000-0000-4000-8000-000000000001'
export const HAND_FINISHED_A = '1a000000-0000-4000-8000-000000000004'
export const FRAME_A_OAK = '1f000000-0000-4000-8000-000000000001'
export const MAT_A_WHITE = '1d000000-0000-4000-8000-000000000001'
export const PRINT_B = '2a000000-0000-4000-8000-000000000001'
export const WEBHOOK_SECRET = 'test-webhook-secret'

/** A fresh in-process Postgres with the Supabase roles, the migrations, the seed and test users. */
export async function makeDb(): Promise<PGlite> {
  const db = await PGlite.create()
  await db.exec(read('test/supabase-shim.sql'))
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  for (const file of migrations) await db.exec(read(`supabase/migrations/${file}`))
  await db.exec(read('supabase/seed.sql'))
  await db.exec(read('test/fixtures.sql'))
  return db
}

/** Runs fn exactly as PostgREST would for a signed-in user: role authenticated, JWT claims set. */
export function asUser<T>(db: PGlite, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(userId ? 'set local role authenticated' : 'set local role anon')
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : '',
    ])
    return fn(tx)
  })
}

export function asService<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role')
    return fn(tx)
  })
}

export async function rpc<T = any>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ result: T }>(sql, params)
  return rows[0].result
}

export const quote = (db: PGlite, user: string, items: unknown[], currency: string, country: string) =>
  asUser(db, user, (tx) =>
    rpc(tx, 'select public.quote_order($1::jsonb, $2, $3) as result', [JSON.stringify(items), currency, country]),
  )
