import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { handleFulfilmentWebhook } from '../_shared/webhook.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

let cachedSecret: string | null = null

Deno.serve((req) =>
  handleFulfilmentWebhook(req, {
    async secret() {
      if (cachedSecret) return cachedSecret
      const { data, error } = await admin.rpc('get_app_secret', { p_name: 'prodigi_webhook_secret' })
      if (error || !data) throw new Error('webhook secret not configured')
      cachedSecret = data as string
      return cachedSecret
    },
    async applyEvent({ id, type, orderId, payload }) {
      const { data, error } = await admin.rpc('apply_fulfilment_event', {
        p_event_id: id,
        p_event_type: type,
        p_order_id: orderId,
        p_payload: payload,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
  }),
)
