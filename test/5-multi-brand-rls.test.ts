import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { handleCreateOrder } from '../supabase/functions/_shared/create-order.ts'
import { A_CUSTOMER, A_CUSTOMER_2, A_STAFF, BRAND_B, B_CUSTOMER, PRINT_B, asUser, makeDb, quote } from './db.ts'
import { createOrderDeps, post, tokens } from './harness.ts'

let db: PGlite
const TABLES = ['products', 'frames', 'mats', 'price_list', 'shipping_rates', 'orders', 'order_items']

beforeAll(async () => {
  db = await makeDb()
  tokens.set('token-a', A_CUSTOMER)
  tokens.set('token-b', B_CUSTOMER)
  // One order in each brand.
  for (const [token, product] of [
    ['token-a', '1a000000-0000-4000-8000-000000000001'],
    ['token-b', PRINT_B],
  ]) {
    await handleCreateOrder(
      post('create-order', { items: [{ product_id: product }], currency: 'USD', ship_country: 'US' }, { Authorization: `Bearer ${token}` }),
      createOrderDeps(db),
    )
  }
})

const countBrandRows = (user: string | null, table: string, brand: string) =>
  asUser(db, user, async (tx) => {
    const { rows } = await tx.query<{ n: number }>(`select count(*)::int as n from public.${table} where brand_id = $1`, [brand])
    return rows[0].n
  })

describe('multi-brand isolation with row-level security', () => {
  for (const table of TABLES) {
    it(`a Brand A user sees zero Brand B rows in ${table}`, async () => {
      expect(await countBrandRows(A_CUSTOMER, table, BRAND_B)).toBe(0)
      expect(await countBrandRows(A_STAFF, table, BRAND_B)).toBe(0)
    })
  }

  it('Brand B rows exist (the zero above is RLS, not an empty table)', async () => {
    expect(await countBrandRows(B_CUSTOMER, 'products', BRAND_B)).toBe(4)
    expect(await countBrandRows(B_CUSTOMER, 'orders', BRAND_B)).toBe(1)
  })

  it('a Brand A user cannot price or buy a Brand B product', async () => {
    await expect(quote(db, A_CUSTOMER, [{ product_id: PRINT_B }], 'USD', 'US')).rejects.toThrow(/unknown product/)
    const response = await handleCreateOrder(
      post('create-order', { items: [{ product_id: PRINT_B }], currency: 'USD', ship_country: 'US' }, { Authorization: 'Bearer token-a' }),
      createOrderDeps(db),
    )
    expect(response.status).toBe(400)
  })

  it('customers see only their own orders; staff see every order in their brand', async () => {
    const visible = (user: string) =>
      asUser(db, user, async (tx) => (await tx.query<{ n: number }>('select count(*)::int as n from public.orders')).rows[0].n)
    expect(await visible(A_CUSTOMER)).toBe(1)
    expect(await visible(A_CUSTOMER_2)).toBe(0)
    expect(await visible(A_STAFF)).toBe(1)
  })

  it('anonymous visitors read nothing', async () => {
    await expect(countBrandRows(null, 'products', BRAND_B)).rejects.toThrow(/permission denied/)
  })
})
