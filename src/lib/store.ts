import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)

export const BRANDS = {
  northlight: { id: '11111111-1111-4111-8111-111111111111', name: 'Northlight Prints' },
  verde: { id: '22222222-2222-4222-8222-222222222222', name: 'Studio Verde' },
} as const

export const DEMO_ACCOUNTS = [
  { brand: BRANDS.northlight, email: 'northlight.demo@example.com', password: 'northlight-demo-2026' },
  { brand: BRANDS.verde, email: 'verde.demo@example.com', password: 'verde-demo-2026' },
]

export type Currency = 'USD' | 'CAD' | 'GBP'
export type Country = 'US' | 'CA' | 'GB'

export type CartItem = { product_id: string; frame_id: string | null; mat_id: string | null; quantity: number }

export type QuoteLine = {
  product_id: string
  title: string
  frame_id: string | null
  mat_id: string | null
  quantity: number
  finish: 'standard' | 'hand_finished'
  fulfilment_route: 'prodigi' | 'studio'
  unit_print_minor: number
  unit_frame_minor: number
  unit_mat_minor: number
  unit_finish_minor: number
  line_total_minor: number
}

export type Quote = {
  currency: Currency
  ship_country: Country
  lines: QuoteLine[]
  subtotal_minor: number
  shipping_minor: number
  tax_minor: number
  tax_label: string
  tax_rate_bp: number
  total_minor: number
}

/** The server's price for a cart. The browser never adds anything up itself. */
export async function fetchQuote(items: CartItem[], currency: Currency, country: Country): Promise<Quote> {
  const { data, error } = await supabase.rpc('quote_order', { p_items: items, p_currency: currency, p_country: country })
  if (error) throw new Error(error.message)
  return data as Quote
}

export function money(minor: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(minor / 100)
}

const CART_KEY = 'demo-cart'

export function loadCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveCart(items: CartItem[]): void {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items))
  } catch {
    // Private mode or blocked storage: the cart just lasts for this page view.
  }
}
