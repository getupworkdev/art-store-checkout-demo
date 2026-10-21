import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type Country, type Currency, type Quote, fetchQuote, loadCart, money, saveCart, supabase } from '../lib/store.ts'

const DESTINATIONS: { country: Country; label: string; currency: Currency }[] = [
  { country: 'US', label: 'United States', currency: 'USD' },
  { country: 'CA', label: 'Canada', currency: 'CAD' },
  { country: 'GB', label: 'United Kingdom', currency: 'GBP' },
]

export function CartPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState(loadCart)
  const [country, setCountry] = useState<Country>('US')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!items.length) {
      setQuote(null)
      return
    }
    fetchQuote(items, currency, country)
      .then((q) => {
        setQuote(q)
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [items, currency, country])

  function remove(index: number) {
    const next = items.filter((_, i) => i !== index)
    saveCart(next)
    setItems(next)
  }

  async function pay() {
    setPaying(true)
    setError('')
    const { data, error } = await supabase.functions.invoke('create-order', {
      body: { items, currency, ship_country: country },
    })
    setPaying(false)
    if (error) {
      setError(error.message)
      return
    }
    saveCart([])
    navigate(`/orders/${data.order_id}`)
  }

  if (!items.length) return <p className="muted">Your cart is empty.</p>

  return (
    <section className="card">
      <h1>Cart</h1>
      <div className="row">
        <label>
          Ship to
          <select
            value={country}
            onChange={(e) => {
              const d = DESTINATIONS.find((x) => x.country === e.target.value)!
              setCountry(d.country)
              setCurrency(d.currency)
            }}
          >
            {DESTINATIONS.map((d) => (
              <option key={d.country} value={d.country}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pay in
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {DESTINATIONS.map((d) => (
              <option key={d.currency}>{d.currency}</option>
            ))}
          </select>
        </label>
      </div>

      {quote && (
        <table>
          <tbody>
            {quote.lines.map((line, i) => (
              <tr key={i}>
                <td>
                  {line.title} ×{line.quantity}
                  {line.finish === 'hand_finished' && <span className="badge">Hand-finished · studio</span>}
                  <button className="link" onClick={() => remove(i)}>
                    Remove
                  </button>
                  <div className="muted small">
                    Print {money(line.unit_print_minor, quote.currency)}
                    {line.unit_frame_minor > 0 && ` + frame ${money(line.unit_frame_minor, quote.currency)}`}
                    {line.unit_mat_minor > 0 && ` + mat ${money(line.unit_mat_minor, quote.currency)}`}
                    {line.unit_finish_minor > 0 && ` + hand finish ${money(line.unit_finish_minor, quote.currency)}`}
                    {' each'}
                  </div>
                </td>
                <td className="num">{money(line.line_total_minor, quote.currency)}</td>
              </tr>
            ))}
            <tr>
              <td>Subtotal</td>
              <td className="num">{money(quote.subtotal_minor, quote.currency)}</td>
            </tr>
            <tr>
              <td>Shipping</td>
              <td className="num">{money(quote.shipping_minor, quote.currency)}</td>
            </tr>
            <tr>
              <td>{quote.tax_label}</td>
              <td className="num">{money(quote.tax_minor, quote.currency)}</td>
            </tr>
            <tr className="total">
              <td>Total charged</td>
              <td className="num">{money(quote.total_minor, quote.currency)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="muted small">
        Totals come from the database function that also prices the order you pay for, so the number above is the number charged.
      </p>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!quote || paying} onClick={pay}>
        {paying ? 'Paying…' : 'Pay (test mode)'}
      </button>
    </section>
  )
}
