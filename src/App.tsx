import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/store.ts'
import { CartPage } from './pages/CartPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { OrderPage } from './pages/OrderPage.tsx'
import { OrdersPage } from './pages/OrdersPage.tsx'
import { ProductPage } from './pages/ProductPage.tsx'
import { ShopPage } from './pages/ShopPage.tsx'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [brandName, setBrandName] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    // RLS returns only the signed-in user's brand.
    supabase
      .from('brands')
      .select('name')
      .maybeSingle()
      .then(({ data }) => setBrandName(data?.name ?? ''))
  }, [session])

  if (session === undefined) return null

  return (
    <BrowserRouter>
      <div className="banner">Demo store with fictional brands and placeholder art. Payments are test mode only.</div>
      {session && (
        <header className="top">
          <Link to="/" className="brand">
            {brandName || 'Store'}
          </Link>
          <nav>
            <Link to="/">Shop</Link>
            <Link to="/cart">Cart</Link>
            <Link to="/orders">Orders</Link>
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          </nav>
        </header>
      )}
      <main>
        <Routes>
          {!session ? (
            <Route path="*" element={<LoginPage />} />
          ) : (
            <>
              <Route path="/" element={<ShopPage />} />
              <Route path="/products/:id" element={<ProductPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:id" element={<OrderPage />} />
              <Route path="*" element={<Navigate to="/" />} />
            </>
          )}
        </Routes>
      </main>
    </BrowserRouter>
  )
}
