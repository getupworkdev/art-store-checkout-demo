import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { type Quote, fetchQuote, loadCart, money, saveCart, supabase } from '../lib/store.ts'

type Option = { id: string; name: string }
type Product = { id: string; title: string; artist: string; image_path: string; finish: string }

export function ProductPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState<Product | null>(null)
  const [frames, setFrames] = useState<Option[]>([])
  const [mats, setMats] = useState<Option[]>([])
  const [frameId, setFrameId] = useState('')
  const [matId, setMatId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [quote, setQuote] = useState<Quote | null>(null)

  useEffect(() => {
    supabase.from('products').select('id, title, artist, image_path, finish').eq('id', id).maybeSingle().then(({ data }) => setProduct(data))
    supabase.from('frames').select('id, name').order('code').then(({ data }) => setFrames(data ?? []))
    supabase.from('mats').select('id, name').order('code').then(({ data }) => setMats(data ?? []))
  }, [id])

  useEffect(() => {
    if (!product) return
    fetchQuote([{ product_id: id, frame_id: frameId || null, mat_id: matId || null, quantity }], 'USD', 'US')
      .then(setQuote)
      .catch(() => setQuote(null))
  }, [product, id, frameId, matId, quantity])

  if (!product) return <p className="muted">Loading…</p>
  const line = quote?.lines[0]

  function addToCart() {
    saveCart([...loadCart(), { product_id: id, frame_id: frameId || null, mat_id: matId || null, quantity }])
    navigate('/cart')
  }

  return (
    <div className="split">
      <img className="hero" src={product.image_path} alt={`${product.title}, placeholder artwork`} />
      <section className="card">
        <h1>{product.title}</h1>
        <p className="muted">{product.artist}</p>
        {product.finish === 'hand_finished' && (
          <p className="badge">Hand-finished in our studio. The surcharge is set on the server.</p>
        )}
        <label>
          Frame
          <select value={frameId} onChange={(e) => setFrameId(e.target.value)}>
            <option value="">Unframed</option>
            {frames.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mat
          <select value={matId} onChange={(e) => setMatId(e.target.value)}>
            <option value="">No mat</option>
            {mats.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input type="number" min={1} max={20} value={quantity} onChange={(e) => setQuantity(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
        </label>
        {line && (
          <dl className="breakdown">
            <dt>Print</dt>
            <dd>{money(line.unit_print_minor, 'USD')}</dd>
            {line.unit_frame_minor > 0 && (
              <>
                <dt>Frame</dt>
                <dd>{money(line.unit_frame_minor, 'USD')}</dd>
              </>
            )}
            {line.unit_mat_minor > 0 && (
              <>
                <dt>Mat</dt>
                <dd>{money(line.unit_mat_minor, 'USD')}</dd>
              </>
            )}
            {line.unit_finish_minor > 0 && (
              <>
                <dt>Hand finish</dt>
                <dd>{money(line.unit_finish_minor, 'USD')}</dd>
              </>
            )}
            <dt>
              <strong>Item total (×{line.quantity})</strong>
            </dt>
            <dd>
              <strong>{money(line.line_total_minor, 'USD')}</strong>
            </dd>
          </dl>
        )}
        <p className="muted small">Prices in USD here. Pick your currency and destination in the cart.</p>
        <button className="primary" onClick={addToCart}>
          Add to cart
        </button>
      </section>
    </div>
  )
}
