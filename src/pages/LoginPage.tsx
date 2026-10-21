import { useState } from 'react'
import { DEMO_ACCOUNTS, supabase } from '../lib/store.ts'

export function LoginPage() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  async function signIn(email: string, password: string) {
    setBusy(email)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy('')
  }

  return (
    <section className="card login">
      <h1>Art store checkout demo</h1>
      <p className="muted">
        Two fictional brands share one database. Each demo shopper can only see their own brand's catalogue and orders.
      </p>
      <div className="stack">
        {DEMO_ACCOUNTS.map((account) => (
          <button key={account.email} className="primary" disabled={!!busy} onClick={() => signIn(account.email, account.password)}>
            {busy === account.email ? 'Signing in…' : `Shop ${account.brand.name}`}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
