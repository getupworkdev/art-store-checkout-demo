import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { handleCreateOrder } from '../supabase/functions/_shared/create-order.ts'
import { createStripeAdapter, type PaymentIntentResult } from '../supabase/functions/_shared/stripe.ts'
import { A_CUSTOMER, FRAME_A_OAK, HAND_FINISHED_A, MAT_A_WHITE, PRINT_A, asUser, makeDb, quote } from './db.ts'
import { createOrderDeps, post, tokens } from './harness.ts'

let db: PGlite

beforeAll(async () => {
  db = await makeDb()
  tokens.set('token-a', A_CUSTOMER)
})

const items = [
  { product_id: PRINT_A, frame_id: FRAME_A_OAK, mat_id: MAT_A_WHITE, quantity: 2 },
  { product_id: HAND_FINISHED_A, quantity: 1 },
]

describe('one server-side price for the quote, the order and the PaymentIntent', () => {
  for (const [currency, country] of [
    ['USD', 'US'],
    ['CAD', 'CA'],
    ['GBP', 'GB'],
  ]) {
    it(`displayed total equals charged total in ${currency}`, async () => {
      const displayed = await quote(db, A_CUSTOMER, items, currency, country)

      const charged: PaymentIntentResult[] = []
      const response = await handleCreateOrder(
        post('create-order', { items, currency, ship_country: country }, { Authorization: 'Bearer token-a' }),
        createOrderDeps(db, charged),
      )
      const body = await response.json()
      const stored = await asUser(db, A_CUSTOMER, (tx) =>
        tx.query<{ total_minor: number; currency: string }>('select total_minor, currency from public.orders where id = $1', [body.order_id]),
      )

      expect(displayed.currency).toBe(currency)
      expect(charged).toHaveLength(1)
      expect(charged[0].amount).toBe(displayed.total_minor)
      expect(charged[0].currency).toBe(currency)
      expect(stored.rows[0]).toEqual({ total_minor: displayed.total_minor, currency })
      expect(displayed.total_minor).toBe(displayed.subtotal_minor + displayed.shipping_minor + displayed.tax_minor)
    })
  }

  it('tax is applied to goods plus shipping and rounded to the minor unit', async () => {
    const q = await quote(db, A_CUSTOMER, items, 'CAD', 'CA')
    expect(q.tax_rate_bp).toBe(1300)
    expect(q.tax_minor).toBe(Math.round(((q.subtotal_minor + q.shipping_minor) * 1300) / 10000))
  })

  it('the Stripe adapter sends exactly that amount, in that currency, with an idempotency key per order', async () => {
    const sent: { url: string; init: RequestInit }[] = []
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, init })
      const form = new URLSearchParams(init.body as string)
      return new Response(
        JSON.stringify({ id: 'pi_123', status: 'succeeded', amount: Number(form.get('amount')), currency: form.get('currency') }),
        { status: 200 },
      )
    }) as unknown as typeof fetch
    const stripe = createStripeAdapter('sk_test_dummy', fakeFetch)
    const result = await stripe.createPaymentIntent({ amount: 31_234, currency: 'GBP', orderId: 'order-1' })

    const form = new URLSearchParams(sent[0].init.body as string)
    expect(form.get('amount')).toBe('31234')
    expect(form.get('currency')).toBe('gbp')
    expect((sent[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe('order-order-1')
    expect(result).toMatchObject({ amount: 31_234, currency: 'GBP', mode: 'stripe_test' })
  })

  it('refuses live-mode Stripe keys', async () => {
    const stripe = createStripeAdapter('sk_live_nope', (async () => new Response('{}')) as unknown as typeof fetch)
    await expect(stripe.createPaymentIntent({ amount: 100, currency: 'USD', orderId: 'x' })).rejects.toThrow(/test-mode/)
  })
})
