import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { money, supabase } from '../lib/store.ts'

type Order = { id: string; status: string; currency: string; total_minor: number; created_at: string }

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null)

  useEffect(() => {
    supabase
      .from('orders')
      .select('id, status, currency, total_minor, created_at')
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders(data ?? []))
  }, [])

  if (!orders) return <p className="muted">Loading…</p>
  if (!orders.length) return <p className="muted">No orders yet.</p>
  return (
    <section className="card">
      <h1>Your orders</h1>
      <table>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link to={`/orders/${o.id}`}>{o.id.slice(0, 8)}</Link>
                <div className="muted small">{new Date(o.created_at).toLocaleString()}</div>
              </td>
              <td>
                <span className={`status s-${o.status}`}>{o.status.replace('_', ' ')}</span>
              </td>
              <td className="num">{money(o.total_minor, o.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
