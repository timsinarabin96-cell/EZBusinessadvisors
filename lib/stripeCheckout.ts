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

/**
 * Demo mode (free feature grants) is ONLY allowed outside production.
 * In production, if Stripe isn't configured, checkout must FAIL CLOSED —
 * otherwise paid features (verified badge, featured slots, license, add-ons)
 * activate for free. This is the "demo-mode leak" guard from the 8/26 audit.
 */
export function demoModeAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/** Standard 503 payload when production blocks demo-mode grants. */
export function demoBlockedError(): { ok: boolean; error: string } {
  return {
    ok: false,
    error: 'Payments are not configured yet. Add STRIPE_SECRET_KEY to enable live purchases — demo grants are disabled in production.',
  }
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

// ---------------------------------------------------------------------------
// Refunds — full money loop: buyer didn't receive the product → owner refunds
// from the admin dashboard. Uses the session's payment_intent; the Stripe
// refund API returns the money to the buyer's original payment method.
// ---------------------------------------------------------------------------

export interface StripeRefundResult {
  ok: boolean
  refundId?: string
  amountCents?: number
  error?: string
}

/**
 * Refund a paid Stripe Checkout session (full or partial).
 * Resolves the session's payment_intent, then issues the refund.
 */
export async function refundCheckoutSession(
  sessionId: string,
  opts?: { amountCents?: number; reason?: string },
): Promise<StripeRefundResult> {
  if (!stripeConfigured()) return { ok: false, error: 'Stripe is not connected' }
  try {
    // Resolve payment_intent from the checkout session.
    const sessRes = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    })
    const sess = await sessRes.json().catch(() => ({}))
    if (!sessRes.ok || !sess?.payment_intent) {
      return { ok: false, error: sess?.error?.message || 'Could not resolve payment intent for this order' }
    }

    const params = new URLSearchParams()
    params.set('payment_intent', sess.payment_intent)
    if (opts?.amountCents) params.set('amount', String(Math.round(opts.amountCents)))
    if (opts?.reason) params.set('reason', opts.reason)
    params.set('metadata[platform]', 'concord_store_refund')

    const refRes = await fetch(`${STRIPE_API}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    const ref = await refRes.json().catch(() => ({}))
    if (!refRes.ok) {
      return { ok: false, error: ref?.error?.message || `Stripe refund error ${refRes.status}` }
    }
    return { ok: true, refundId: ref.id, amountCents: ref.amount }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Refund request failed' }
  }
}

/** Fetch a checkout session's public metadata (used by the refund route). */
export async function getCheckoutSessionMetadata(sessionId: string): Promise<Record<string, string> | null> {
  if (!stripeConfigured()) return null
  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    })
    const data = await res.json().catch(() => ({}))
    return res.ok && data?.metadata ? data.metadata : null
  } catch {
    return null
  }
}
