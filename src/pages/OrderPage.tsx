import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { money, supabase } from '../lib/store.ts'

type Order = {
  id: string
  status: string
  currency: string
  subtotal_minor: number
  shipping_minor: number
  tax_minor: number
  total_minor: number
  payment_intent_id: string | null
  payment_mode: string | null
  tracking_number: string | null
  tracking_url: string | null
}
type Item = {
  quantity: number
  finish: string
  fulfilment_route: string
  line_total_minor: number
  products: { title: string } | null
}
type History = { id: number; from_status: string | null; to_status: string; source: string; event_id: string | null; at: string }
type Event = { event_id: string; event_type: string; outcome: string; received_at: string }

const STAGES = [
  { stage: 'in_production', label: 'In production' },
  { stage: 'shipped', label: 'Shipped' },
  { stage: 'delivered', label: 'Delivered' },
] as const

export function OrderPage() {
  const { id = '' } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [log, setLog] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [o, i, h, e] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).maybeSingle(),
      supabase.from('order_items').select('quantity, finish, fulfilment_route, line_total_minor, products(title)').eq('order_id', id),
      supabase.from('order_status_history').select('*').eq('order_id', id).order('id'),
      supabase.from('fulfilment_events').select('event_id, event_type, outcome, received_at').eq('order_id', id).order('received_at'),
    ])
    setOrder(o.data)
    setItems((i.data as unknown as Item[]) ?? [])
    setHistory(h.data ?? [])
    setEvents(e.data ?? [])
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function simulate(stage: string, times: number) {
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('simulate-fulfilment', { body: { order_id: id, stage, times } })
    setBusy(false)
    setLog(error ? error.message : data.results.map((r: { outcome?: string; error?: string }) => r.outcome ?? r.error).join(', '))
    load()
  }

  if (!order) return <p className="muted">Loading…</p>

  return (
    <div className="split">
      <section className="card">
        <h1>Order {order.id.slice(0, 8)}</h1>
        <p>
          <span className={`status s-${order.status}`}>{order.status.replace('_', ' ')}</span>
        </p>
        <table>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td>
                  {item.products?.title} ×{item.quantity}
                  <div className="muted small">
                    {item.finish === 'hand_finished' ? 'Hand-finished' : 'Standard'} → {item.fulfilment_route === 'studio' ? 'in-house studio' : 'print partner'}
                  </div>
                </td>
                <td className="num">{money(item.line_total_minor, order.currency)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total paid</td>
              <td className="num">{money(order.total_minor, order.currency)}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          Payment {order.payment_intent_id} ({order.payment_mode === 'stripe_test' ? 'Stripe test mode' : 'simulated test payment'})
        </p>
        {order.tracking_number && (
          <p className="small">
            Tracking: <a href={order.tracking_url ?? '#'}>{order.tracking_number}</a> (demo)
          </p>
        )}
      </section>

      <section className="card">
        <h2>Fulfilment</h2>
        <p className="muted small">
          These buttons act as the print partner: each sends a signed webhook to the real endpoint. Replaying an event changes
          nothing.
        </p>
        <div className="row wrap">
          {STAGES.map((s) => (
            <span key={s.stage} className="row">
              <button disabled={busy} onClick={() => simulate(s.stage, 1)}>
                Send “{s.label}”
              </button>
              <button disabled={busy} onClick={() => simulate(s.stage, 5)}>
                ×5
              </button>
            </span>
          ))}
        </div>
        {log && <p className="small">Webhook responses: {log}</p>}

        <h3>Status history</h3>
        <ol className="timeline">
          {history.map((h) => (
            <li key={h.id}>
              {h.from_status ?? 'new'} → <strong>{h.to_status}</strong> <span className="muted small">via {h.source}</span>
            </li>
          ))}
        </ol>

        <h3>Stored webhook events</h3>
        {events.length === 0 ? (
          <p className="muted small">None yet.</p>
        ) : (
          <ul className="small">
            {events.map((e) => (
              <li key={e.event_id}>
                <code>{e.event_id}</code> {e.event_type} → {e.outcome}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
