// Demo-only stand-in for the print partner: signs a fulfilment event and posts it to the real
// webhook endpoint, optionally several times, so idempotency can be seen on the live site.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { bearerToken, corsHeaders, json } from '../_shared/http.ts'
import { SIGNATURE_HEADER, buildEvent, signBody } from '../_shared/webhook.ts'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const token = bearerToken(req)
  if (!token) return json(401, { error: 'sign in required' })

  const { order_id, stage, times } = await req.json().catch(() => ({}))
  if (!['in_production', 'shipped', 'delivered'].includes(stage)) return json(400, { error: 'unknown stage' })
  const sends = Math.min(Math.max(Number(times) || 1, 1), 5)

  // The caller must be able to see the order under RLS.
  const asUser = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: order } = await asUser.from('orders').select('id').eq('id', order_id).maybeSingle()
  if (!order) return json(404, { error: 'order not found' })

  const { data: secret } = await admin.rpc('get_app_secret', { p_name: 'prodigi_webhook_secret' })
  const body = JSON.stringify(buildEvent(order.id, stage))
  const signature = await signBody(secret as string, body)

  const results = []
  for (let i = 0; i < sends; i++) {
    const response = await fetch(`${url}/functions/v1/fulfilment-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [SIGNATURE_HEADER]: signature },
      body,
    })
    results.push(await response.json())
  }
  return json(200, { sent: sends, results })
})
