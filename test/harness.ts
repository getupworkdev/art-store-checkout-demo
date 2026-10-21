// Wires the real Edge Function handlers to the in-process database, the way the Deno
// entrypoints wire them to Supabase.
import type { PGlite } from '@electric-sql/pglite'
import { type CreateOrderDeps } from '../supabase/functions/_shared/create-order.ts'
import type { PaymentIntentResult } from '../supabase/functions/_shared/stripe.ts'
import { type WebhookDeps } from '../supabase/functions/_shared/webhook.ts'
import { asService, asUser, rpc } from './db.ts'

/** Test tokens map to user ids; anything else is rejected, like an invalid JWT. */
export const tokens = new Map<string, string>()

export function createOrderDeps(db: PGlite, charged: PaymentIntentResult[] = []): CreateOrderDeps & { calls: { createOrder: number } } {
  const calls = { createOrder: 0 }
  return {
    calls,
    async authenticate(token) {
      return tokens.get(token) ?? null
    },
    async createOrder(token, input) {
      calls.createOrder++
      return asUser(db, tokens.get(token)!, (tx) =>
        rpc(tx, 'select public.create_order($1::jsonb, $2, $3) as result', [
          JSON.stringify(input.items),
          input.currency,
          input.ship_country,
        ]),
      )
    },
    async createPaymentIntent({ amount, currency, orderId }) {
      const intent: PaymentIntentResult = { id: `pi_test_${orderId}`, status: 'succeeded', amount, currency, mode: 'simulated' }
      charged.push(intent)
      return intent
    },
    async recordPayment({ orderId, paymentIntentId, mode, succeeded }) {
      return asService(db, (tx) =>
        rpc(tx, 'select public.record_payment($1, $2, $3, $4) as result', [orderId, paymentIntentId, mode, succeeded]),
      )
    },
  }
}

export function webhookDeps(db: PGlite, secret: string): WebhookDeps {
  return {
    async secret() {
      return secret
    },
    async applyEvent({ id, type, orderId, payload }) {
      return asService(db, (tx) =>
        rpc(tx, 'select public.apply_fulfilment_event($1, $2, $3, $4::jsonb) as result', [id, type, orderId, JSON.stringify(payload)]),
      )
    },
  }
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost/functions/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
