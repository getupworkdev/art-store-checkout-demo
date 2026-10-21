export type PaymentIntentResult = {
  id: string
  status: string
  amount: number
  currency: string
  mode: 'stripe_test' | 'simulated'
}

type Fetch = typeof fetch

/**
 * With a Stripe test key: creates and confirms a PaymentIntent with Stripe's test card, for
 * exactly the amount create_order() returned. Without a key: simulates a successful test-mode
 * payment so the demo works end to end, and says so in the result.
 */
export function createStripeAdapter(secretKey: string | undefined, fetchImpl: Fetch = fetch) {
  return {
    async createPaymentIntent(args: { amount: number; currency: string; orderId: string }): Promise<PaymentIntentResult> {
      if (!secretKey) {
        return {
          id: `pi_simulated_${args.orderId.replaceAll('-', '')}`,
          status: 'succeeded',
          amount: args.amount,
          currency: args.currency,
          mode: 'simulated',
        }
      }
      if (!secretKey.startsWith('sk_test_')) throw new Error('only Stripe test-mode keys are allowed in this demo')

      const form = new URLSearchParams({
        amount: String(args.amount),
        currency: args.currency.toLowerCase(),
        confirm: 'true',
        payment_method: 'pm_card_visa',
        'automatic_payment_methods[enabled]': 'true',
        'automatic_payment_methods[allow_redirects]': 'never',
        'metadata[order_id]': args.orderId,
      })
      const response = await fetchImpl('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          // A retried checkout for the same order never creates a second charge.
          'Idempotency-Key': `order-${args.orderId}`,
        },
        body: form,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message ?? 'Stripe error')
      return { id: body.id, status: body.status, amount: body.amount, currency: body.currency.toUpperCase(), mode: 'stripe_test' }
    },
  }
}
