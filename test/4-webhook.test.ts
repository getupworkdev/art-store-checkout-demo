import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { handleCreateOrder } from '../supabase/functions/_shared/create-order.ts'
import { SIGNATURE_HEADER, buildEvent, handleFulfilmentWebhook, signBody } from '../supabase/functions/_shared/webhook.ts'
import { A_CUSTOMER, PRINT_A, WEBHOOK_SECRET, makeDb } from './db.ts'
import { createOrderDeps, post, tokens, webhookDeps } from './harness.ts'

let db: PGlite

beforeAll(async () => {
  db = await makeDb()
  tokens.set('token-a', A_CUSTOMER)
})

async function paidOrder(): Promise<string> {
  const response = await handleCreateOrder(
    post('create-order', { items: [{ product_id: PRINT_A }], currency: 'USD', ship_country: 'US' }, { Authorization: 'Bearer token-a' }),
    createOrderDeps(db),
  )
  return (await response.json()).order_id
}

async function deliver(body: string, signature: string | null) {
  const headers: Record<string, string> = signature ? { [SIGNATURE_HEADER]: signature } : {}
  const response = await handleFulfilmentWebhook(post('fulfilment-webhook', body, headers), webhookDeps(db, WEBHOOK_SECRET))
  return { status: response.status, body: await response.json() }
}

const counts = async (orderId: string) => {
  const { rows } = await db.query<{ status: string; events: number; changes: number; tracking_number: string | null }>(
    `select o.status, o.tracking_number,
            (select count(*)::int from public.fulfilment_events e where e.order_id = o.id) as events,
            (select count(*)::int from public.order_status_history h where h.order_id = o.id and h.source = 'fulfilment_webhook') as changes
     from public.orders o where o.id = $1`,
    [orderId],
  )
  return rows[0]
}

describe('fulfilment webhook: verified, stored once, applied once', () => {
  it('rejects a missing or wrong signature and stores nothing', async () => {
    const orderId = await paidOrder()
    const body = JSON.stringify(buildEvent(orderId, 'in_production'))

    expect((await deliver(body, null)).status).toBe(401)
    expect((await deliver(body, await signBody('wrong-secret', body))).status).toBe(401)
    // A valid signature over different bytes does not carry over to a modified body.
    const signed = await signBody(WEBHOOK_SECRET, body)
    expect((await deliver(body.replace('in_production', 'delivered'), signed)).status).toBe(401)

    expect(await counts(orderId)).toMatchObject({ status: 'paid', events: 0, changes: 0 })
  })

  it('replaying the same event five times changes the order exactly once', async () => {
    const orderId = await paidOrder()
    const body = JSON.stringify(buildEvent(orderId, 'shipped'))
    const signature = await signBody(WEBHOOK_SECRET, body)

    const outcomes = []
    for (let i = 0; i < 5; i++) outcomes.push((await deliver(body, signature)).body.outcome)

    expect(outcomes).toEqual(['applied', 'duplicate', 'duplicate', 'duplicate', 'duplicate'])
    const after = await counts(orderId)
    expect(after).toMatchObject({ status: 'shipped', events: 1, changes: 1 })
    expect(after.tracking_number).toMatch(/^DEMO/)
  })

  it('five deliveries fired in parallel still apply the event once', async () => {
    const orderId = await paidOrder()
    const body = JSON.stringify(buildEvent(orderId, 'in_production'))
    const signature = await signBody(WEBHOOK_SECRET, body)
    const results = await Promise.all(Array.from({ length: 5 }, () => deliver(body, signature)))
    expect(results.filter((r) => r.body.outcome === 'applied')).toHaveLength(1)
    expect(await counts(orderId)).toMatchObject({ status: 'in_production', events: 1, changes: 1 })
  })

  it('a late, older event never moves an order backwards', async () => {
    const orderId = await paidOrder()
    for (const stage of ['delivered', 'shipped'] as const) {
      const body = JSON.stringify(buildEvent(orderId, stage))
      await deliver(body, await signBody(WEBHOOK_SECRET, body))
    }
    expect(await counts(orderId)).toMatchObject({ status: 'delivered', events: 2, changes: 1 })
  })
})
