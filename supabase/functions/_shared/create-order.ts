import { bearerToken, corsHeaders, json } from './http.ts'
import type { PaymentIntentResult } from './stripe.ts'

export type CheckoutItem = { product_id: string; frame_id: string | null; mat_id: string | null; quantity: number }
export type CheckoutInput = { items: CheckoutItem[]; currency: string; ship_country: string }
export type CreatedOrder = { order_id: string; total_minor: number; currency: string }

export type CreateOrderDeps = {
  /** Returns the user id for a valid access token, or null. */
  authenticate(token: string): Promise<string | null>
  /** Calls create_order() as the signed-in user, so prices come from the database. */
  createOrder(token: string, input: CheckoutInput): Promise<CreatedOrder>
  createPaymentIntent(args: { amount: number; currency: string; orderId: string }): Promise<PaymentIntentResult>
  recordPayment(args: { orderId: string; paymentIntentId: string; mode: string; succeeded: boolean }): Promise<string>
}

/**
 * Only product, frame, mat and quantity survive from the request body. Prices, totals and
 * finishes sent by a browser are dropped here and ignored again by the database.
 */
export function parseCheckout(body: unknown): CheckoutInput | null {
  if (!body || typeof body !== 'object') return null
  const { items, currency, ship_country } = body as Record<string, unknown>
  if (!Array.isArray(items) || typeof currency !== 'string' || typeof ship_country !== 'string') return null
  return {
    currency,
    ship_country,
    items: items.map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>
      return {
        product_id: String(item.product_id ?? ''),
        frame_id: typeof item.frame_id === 'string' && item.frame_id ? item.frame_id : null,
        mat_id: typeof item.mat_id === 'string' && item.mat_id ? item.mat_id : null,
        quantity: Number.isInteger(item.quantity) ? (item.quantity as number) : 1,
      }
    }),
  }
}

export async function handleCreateOrder(req: Request, deps: CreateOrderDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })

  const token = bearerToken(req)
  if (!token) return json(401, { error: 'sign in required' })
  const userId = await deps.authenticate(token)
  if (!userId) return json(401, { error: 'invalid or expired session' })

  let input: CheckoutInput | null = null
  try {
    input = parseCheckout(await req.json())
  } catch {
    input = null
  }
  if (!input) return json(400, { error: 'expected { items, currency, ship_country }' })

  let order: CreatedOrder
  try {
    order = await deps.createOrder(token, input)
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : 'could not create order' })
  }

  const payment = await deps.createPaymentIntent({
    amount: order.total_minor,
    currency: order.currency,
    orderId: order.order_id,
  })
  const status = await deps.recordPayment({
    orderId: order.order_id,
    paymentIntentId: payment.id,
    mode: payment.mode,
    succeeded: payment.status === 'succeeded',
  })

  return json(200, {
    order_id: order.order_id,
    total_minor: order.total_minor,
    currency: order.currency,
    payment,
    order_status: status,
  })
}
