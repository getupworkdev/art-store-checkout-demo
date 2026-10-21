import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BRANDS, supabase } from '../lib/store.ts'

type Product = { id: string; brand_id: string; title: string; artist: string; image_path: string; finish: string }

export function ShopPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [otherBrandRows, setOtherBrandRows] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('products')
      .select('id, brand_id, title, artist, image_path, finish')
      .order('sku')
      .then(({ data }) => setProducts(data ?? []))
  }, [])

  useEffect(() => {
    if (!products.length) return
    // Ask the API directly for the other brand's products: RLS answers with zero rows.
    const other = products[0].brand_id === BRANDS.northlight.id ? BRANDS.verde.id : BRANDS.northlight.id
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', other)
      .then(({ count }) => setOtherBrandRows(count ?? 0))
  }, [products])

  return (
    <>
      <div className="grid">
        {products.map((p) => (
          <Link key={p.id} to={`/products/${p.id}`} className="card product">
            <img src={p.image_path} alt={`${p.title}, placeholder artwork`} />
            <div>
              <strong>{p.title}</strong>
              <div className="muted small">{p.artist}</div>
              {p.finish === 'hand_finished' && <span className="badge">Hand-finished</span>}
            </div>
          </Link>
        ))}
      </div>
      {otherBrandRows !== null && (
        <p className="muted small">Isolation check: products visible from the other brand through the API: {otherBrandRows}</p>
      )}
    </>
  )
}
