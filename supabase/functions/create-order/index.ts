import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { handleCreateOrder } from '../_shared/create-order.ts'
import { createStripeAdapter } from '../_shared/stripe.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const stripe = createStripeAdapter(Deno.env.get('STRIPE_SECRET_KEY'))

Deno.serve((req) =>
  handleCreateOrder(req, {
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    async createOrder(token, input) {
      // The user's own token: RLS and auth.uid() apply inside create_order().
      const asUser = createClient(url, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data, error } = await asUser.rpc('create_order', {
        p_items: input.items,
        p_currency: input.currency,
        p_country: input.ship_country,
      })
      if (error) throw new Error(error.message)
      return data
    },
    createPaymentIntent: stripe.createPaymentIntent,
    async recordPayment({ orderId, paymentIntentId, mode, succeeded }) {
      const { data, error } = await admin.rpc('record_payment', {
        p_order_id: orderId,
        p_payment_intent_id: paymentIntentId,
        p_mode: mode,
        p_succeeded: succeeded,
      })
      if (error) throw new Error(error.message)
      return data
    },
  }),
)
