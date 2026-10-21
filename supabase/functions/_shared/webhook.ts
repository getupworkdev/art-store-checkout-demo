import { json } from './http.ts'

// Prodigi-style fulfilment events. The real provider's payload and signature scheme must be
// confirmed against their documentation; this shape is a stand-in for the demo.
export type FulfilmentEvent = {
  id: string
  type: 'order.in_production' | 'shipment.dispatched' | 'order.delivered' | string
  created: string
  data: {
    merchantReference: string
    shipment?: { carrier: string; trackingNumber: string; trackingUrl: string }
  }
}

export const SIGNATURE_HEADER = 'x-prodigi-signature'

const encoder = new TextEncoder()

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function signBody(secret: string, body: string): Promise<string> {
  return `sha256=${await hmacHex(secret, body)}`
}

export async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header) return false
  const expected = await signBody(secret, body)
  if (expected.length !== header.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i)
  return diff === 0
}

export type WebhookDeps = {
  secret(): Promise<string>
  applyEvent(event: { id: string; type: string; orderId: string; payload: FulfilmentEvent }): Promise<string>
}

export async function handleFulfilmentWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' })
  // Verify against the exact bytes received, before parsing anything.
  const raw = await req.text()
  if (!(await verifySignature(await deps.secret(), raw, req.headers.get(SIGNATURE_HEADER)))) {
    return json(401, { error: 'invalid signature' })
  }

  let event: FulfilmentEvent
  try {
    event = JSON.parse(raw)
  } catch {
    return json(400, { error: 'invalid JSON' })
  }
  if (!event?.id || !event?.type || !event?.data?.merchantReference) {
    return json(400, { error: 'missing id, type or data.merchantReference' })
  }

  try {
    const outcome = await deps.applyEvent({
      id: event.id,
      type: event.type,
      orderId: event.data.merchantReference,
      payload: event,
    })
    return json(200, { received: event.id, outcome })
  } catch (error) {
    return json(422, { error: error instanceof Error ? error.message : 'could not apply event' })
  }
}

export function buildEvent(orderId: string, stage: 'in_production' | 'shipped' | 'delivered'): FulfilmentEvent {
  const type = stage === 'in_production' ? 'order.in_production' : stage === 'shipped' ? 'shipment.dispatched' : 'order.delivered'
  const event: FulfilmentEvent = {
    // Deterministic per order and stage, so a replay carries the same event ID.
    id: `evt_${orderId.replaceAll('-', '').slice(0, 20)}_${stage}`,
    type,
    created: new Date().toISOString(),
    data: { merchantReference: orderId },
  }
  if (stage === 'shipped') {
    const trackingNumber = `DEMO${orderId.replaceAll('-', '').slice(0, 10).toUpperCase()}`
    event.data.shipment = {
      carrier: 'Demo Parcel',
      trackingNumber,
      trackingUrl: `https://example.com/track/${trackingNumber}`,
    }
  }
  return event
}
