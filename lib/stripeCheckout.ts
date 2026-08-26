/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Stripe Checkout — code-complete, gated on live keys
// -----------------------------------------------------------------------------
// Creates Stripe Checkout sessions for marketing-store products and pay-to-list
// orders. If STRIPE_SECRET_KEY is not configured, returns a clear error instead
// of failing silently. Uses the REST API directly (no SDK dependency).
// Server-only.
// =============================================================================

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ''
const STRIPE_API = 'https://api.stripe.com/v1'

export function stripeConfigured(): boolean {
  return STRIPE_SECRET_KEY.startsWith('sk_')
}

export interface CheckoutItem {
  name: string
  amountCents: number
  quantity?: number
  description?: string
  /** Set to 'month' (etc.) to make this line item recurring in subscription mode. */
  recurringInterval?: 'day' | 'week' | 'month' | 'year'
}

export interface CheckoutSessionInput {
  agencyId: string
  items: CheckoutItem[]
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
  customerEmail?: string | null
  /** 'payment' (default) = one-time charge; 'subscription' = recurring billing. */
  mode?: 'payment' | 'subscription'
}

/**
 * Create a Stripe Checkout session. Returns { url } on success.
 * Returns { error } with a clear message when Stripe isn't configured.
 */
export async function createCheckoutSession(input: CheckoutSessionInput): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY to enable live payments.',
    }
  }
  if (!input.items?.length) return { ok: false, error: 'At least one item is required' }

  const params = new URLSearchParams()
  params.set('mode', input.mode === 'subscription' ? 'subscription' : 'payment')
  params.set('success_url', input.successUrl)
  params.set('cancel_url', input.cancelUrl)
  params.set('client_reference_id', input.agencyId)
  if (input.customerEmail) params.set('customer_email', input.customerEmail)
  for (const [k, v] of Object.entries(input.metadata || {})) {
    params.set(`metadata[${k}]`, v)
  }
  for (const [i, item] of input.items.entries()) {
    const prefix = `line_items[${i}]`
    params.set(`${prefix}[price_data][currency]`, 'usd')
    params.set(`${prefix}[price_data][product_data][name]`, item.name)
    if (item.description) params.set(`${prefix}[price_data][product_data][description]`, item.description)
    params.set(`${prefix}[price_data][unit_amount]`, String(Math.round(item.amountCents)))
    if (item.recurringInterval && input.mode === 'subscription') {
      params.set(`${prefix}[price_data][recurring][interval]`, item.recurringInterval)
    }
    params.set(`${prefix}[quantity]`, String(item.quantity || 1))
  }

  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: data.error?.message || `Stripe error ${res.status}` }
    }
    return { ok: true, url: data.url }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Stripe request failed' }
  }
}
