import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { handleCreateOrder } from '../supabase/functions/_shared/create-order.ts'
import { A_CUSTOMER, PRINT_A, asUser, makeDb, rpc } from './db.ts'
import { createOrderDeps, post, tokens } from './harness.ts'

let db: PGlite
const cart = { items: [{ product_id: PRINT_A, quantity: 1 }], currency: 'USD', ship_country: 'US' }

beforeAll(async () => {
  db = await makeDb()
  tokens.set('token-a', A_CUSTOMER)
})

describe('create-order rejects callers without a valid session', () => {
  it('returns 401 without an Authorization header and never touches the database', async () => {
    const deps = createOrderDeps(db)
    const response = await handleCreateOrder(post('create-order', cart), deps)
    expect(response.status).toBe(401)
    expect(deps.calls.createOrder).toBe(0)
  })

  it('returns 401 for a forged or expired token', async () => {
    const deps = createOrderDeps(db)
    const response = await handleCreateOrder(post('create-order', cart, { Authorization: 'Bearer forged.jwt.token' }), deps)
    expect(response.status).toBe(401)
    expect(deps.calls.createOrder).toBe(0)
  })

  it('accepts a valid session and creates a paid order', async () => {
    const response = await handleCreateOrder(post('create-order', cart, { Authorization: 'Bearer token-a' }), createOrderDeps(db))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.order_status).toBe('paid')
  })

  it('the database refuses checkout without a signed-in user, even if the function were bypassed', async () => {
    await expect(
      asUser(db, null, (tx) =>
        rpc(tx, 'select public.create_order($1::jsonb, $2, $3) as result', [JSON.stringify(cart.items), 'USD', 'US']),
      ),
    ).rejects.toThrow(/permission denied/)
  })

  it('a signed-in user cannot insert an order or mark one paid directly', async () => {
    await expect(
      asUser(db, A_CUSTOMER, (tx) =>
        tx.query(
          `insert into public.orders (brand_id, user_id, currency, ship_country, subtotal_minor, shipping_minor, tax_minor, total_minor)
           values ('11111111-1111-4111-8111-111111111111', $1, 'USD', 'US', 1, 0, 0, 1)`,
          [A_CUSTOMER],
        ),
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asUser(db, A_CUSTOMER, (tx) => tx.query(`select public.record_payment(gen_random_uuid(), 'pi_x', 'simulated', true)`)),
    ).rejects.toThrow(/permission denied/)
  })
})
