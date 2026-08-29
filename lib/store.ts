/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// Marketing Materials Store v2 — data layer.
// -----------------------------------------------------------------------------
// Brokers/agents order marketing materials from inside the CRM. Every product
// carries cost_price (owner's supplier cost) + sell_price (broker price); the
// order records unit_cost/unit_sell and profit is computed at checkout. Paid
// orders generate a WORK ORDER that the server auto-sends to the configured
// supplier (store_settings.supplier_email) — the owner never touches anything.
// =============================================================================

import { supabase } from '@/lib/supabase/client'

// --- Types -------------------------------------------------------------------
export type StoreCategory =
  | 'business_cards' | 'flyers' | 'postcards' | 'brochures' | 'banners'
  | 'signage' | 'promo' | 'apparel' | 'stationery' | 'envelopes'

export interface StoreProduct {
  id: string
  name: string
  category: StoreCategory
  description: string | null
  cost_price: number | null
  sell_price: number | null
  supplier: string | null
  image_url: string | null
  is_active: boolean | null
  sort_order: number | null
  created_at?: string | null
}

export interface ShippingAddress {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  zip: string
  country?: string
}

export type StoreOrderStatus =
  | 'paid' | 'work_order_sent' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

export interface StoreOrder {
  id: string
  user_id: string | null
  agency_id: string | null
  product_id: string | null
  product_name: string
  quantity: number
  unit_cost: number
  unit_sell: number
  subtotal: number
  cost_total: number
  profit: number
  shipping_address: ShippingAddress | null
  status: StoreOrderStatus
  work_order_ref: string | null
  tracking_number: string | null
  stripe_session_id: string | null
  created_at: string | null
  product?: StoreProduct | null
}

export interface StoreStats {
  revenue: number
  cost: number
  profit: number
  orderCount: number
  byCategory: { category: string; revenue: number; cost: number; profit: number; orders: number }[]
  recent: StoreOrder[]
}

// --- Catalog metadata --------------------------------------------------------
export const STORE_CATEGORIES: { id: StoreCategory; label: string; icon: string }[] = [
  { id: 'business_cards', label: 'Business Cards', icon: '💳' },
  { id: 'flyers', label: 'Flyers', icon: '📄' },
  { id: 'postcards', label: 'Postcards', icon: '🖼️' },
  { id: 'brochures', label: 'Brochures', icon: '📘' },
  { id: 'banners', label: 'Banners', icon: '🏳️' },
  { id: 'signage', label: 'Signage', icon: '🪧' },
  { id: 'promo', label: 'Promo Items', icon: '🖊️' },
  { id: 'apparel', label: 'Apparel', icon: '👕' },
  { id: 'stationery', label: 'Stationery', icon: '📮' },
  { id: 'envelopes', label: 'Envelopes', icon: '✉️' },
]

export const ORDER_STATUS_META: Record<StoreOrderStatus, { label: string; color: string }> = {
  paid: { label: 'Paid', color: '#c9a84c' },
  work_order_sent: { label: 'Work Order Sent', color: '#1d4ed8' },
  processing: { label: 'Processing', color: '#8b5cf6' },
  shipped: { label: 'Shipped', color: '#16a34a' },
  delivered: { label: 'Delivered', color: '#0f766e' },
  cancelled: { label: 'Cancelled', color: '#dc2626' },
}

// --- Catalog -----------------------------------------------------------------
export async function fetchStoreProducts(category?: StoreCategory): Promise<StoreProduct[]> {
  let q = supabase.from('store_products').select('*').eq('is_active', true).order('sort_order')
  if (category) q = q.eq('category', category)
  const { data, error } = await q
  if (error) return []
  return (data || []) as unknown as StoreProduct[]
}

export async function fetchStoreProduct(id: string): Promise<StoreProduct | null> {
  const { data } = await supabase.from('store_products').select('*').eq('id', id).maybeSingle()
  return (data as unknown as StoreProduct) || null
}

// --- Orders ------------------------------------------------------------------
export async function fetchMyStoreOrders(): Promise<StoreOrder[]> {
  const { data, error } = await supabase
    .from('store_orders')
    .select('*, product:store_products(*)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return []
  return (data || []) as unknown as StoreOrder[]
}

export async function fetchAllStoreOrders(): Promise<StoreOrder[]> {
  const { data, error } = await supabase
    .from('store_orders')
    .select('*, product:store_products(*)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return []
  return (data || []) as unknown as StoreOrder[]
}

/** Owner-only profit dashboard numbers (server computes from all orders). */
export async function fetchStoreStats(): Promise<StoreStats | null> {
  const res = await fetch('/api/store/stats', { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
}

/** Create a Stripe checkout for a store order. Returns the redirect URL. */
export async function checkoutStoreOrder(input: {
  productId: string
  quantity: number
  shippingAddress: ShippingAddress
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const res = await fetch('/api/store/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.ok) return { ok: false, error: data.error || 'Checkout failed' }
  return data
}
