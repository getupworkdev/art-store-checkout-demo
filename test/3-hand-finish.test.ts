import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { handleCreateOrder } from '../supabase/functions/_shared/create-order.ts'
import type { PaymentIntentResult } from '../supabase/functions/_shared/stripe.ts'
import { A_CUSTOMER, HAND_FINISHED_A, PRINT_A, asUser, makeDb, quote } from './db.ts'
import { createOrderDeps, post, tokens } from './harness.ts'

let db: PGlite

beforeAll(async () => {
  db = await makeDb()
  tokens.set('token-a', A_CUSTOMER)
})

async function checkout(items: unknown[]) {
  const charged: PaymentIntentResult[] = []
  const response = await handleCreateOrder(
    post('create-order', { items, currency: 'USD', ship_country: 'US', total_minor: 1 }, { Authorization: 'Bearer token-a' }),
    createOrderDeps(db, charged),
  )
  const { order_id } = await response.json()
  const lines = await asUser(db, A_CUSTOMER, (tx) =>
    tx.query<{ product_id: string; finish: string; fulfilment_route: string; unit_finish_minor: number; line_total_minor: number }>(
      'select product_id, finish, fulfilment_route, unit_finish_minor, line_total_minor from public.order_items where order_id = $1',
      [order_id],
    ),
  )
  return { charged: charged[0], lines: lines.rows }
}

describe('premium hand finish comes from the product record, not the request', () => {
  it('a tampered request (finish "Standard", lowered price) still produces a hand-finished, studio-routed line at full price', async () => {
    const honest = await quote(db, A_CUSTOMER, [{ product_id: HAND_FINISHED_A, quantity: 1 }], 'USD', 'US')
    const surcharge = honest.lines[0].unit_finish_minor
    expect(surcharge).toBeGreaterThan(0)

    const tampered = await checkout([
      { product_id: HAND_FINISHED_A, quantity: 1, finish: 'Standard', unit_price_minor: 1, unit_finish_minor: 0, price: 0.01 },
    ])

    expect(tampered.lines).toHaveLength(1)
    expect(tampered.lines[0]).toMatchObject({
      finish: 'hand_finished',
      fulfilment_route: 'studio',
      unit_finish_minor: surcharge,
      line_total_minor: honest.lines[0].line_total_minor,
    })
    expect(tampered.charged.amount).toBe(honest.total_minor)
  })

  it('asking for hand finish on a standard print adds nothing and routes to the print partner', async () => {
    const { lines } = await checkout([{ product_id: PRINT_A, quantity: 1, finish: 'hand_finished', unit_finish_minor: 99999 }])
    expect(lines[0]).toMatchObject({ finish: 'standard', fulfilment_route: 'prodigi', unit_finish_minor: 0 })
  })

  it('the database itself refuses a hand-finished line routed anywhere but the studio', async () => {
    await expect(
      db.query(`update public.order_items set fulfilment_route = 'prodigi' where finish = 'hand_finished'`),
    ).rejects.toThrow(/check constraint/)
  })
})
