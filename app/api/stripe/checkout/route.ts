import { NextRequest, NextResponse } from 'next/server'
import { PLANS, subscribeToTier } from '@/lib/billing'
import { BUYER_PASS_PLANS, subscribeToBuyerPass } from '@/lib/buyerPass'
import { FEATURED_SLOT_OPTIONS, activateFeaturedSlot } from '@/lib/featuredSlots'
import { createCheckoutSession, stripeConfigured } from '@/lib/stripeCheckout'

export const runtime = 'nodejs'

/**
 * POST /api/stripe/checkout
 * Creates a real Stripe Checkout session for a subscription tier
 * (free / professional / enterprise). Redirects the browser to Stripe.
 *
 * Body: { tier: 'free' | 'professional' | 'enterprise', agencyId?: string }
 *
 * When Stripe isn't configured yet, falls back to recording the subscription
 * (demo mode) so the flow never hard-fails — the UI shows a clear notice.
 */
export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const tier = String(body?.tier || '').trim()
  const plan = PLANS.find((p) => p.id === tier)
  if (!plan) {
    return NextResponse.json({ ok: false, error: 'Unknown plan' }, { status: 400 })
  }

  const origin = req.headers.get('origin') || req.headers.get('referer') || 'http://localhost:3000'
  const product = String(body?.product || 'subscription')

  // --- Buyer Pass product (separate from brokerage SaaS) ---------------------
  if (product === 'buyer_pass') {
    const tier = String(body?.tier || '').trim()
    const plan = BUYER_PASS_PLANS.find((p) => p.id === tier)
    if (!plan) return NextResponse.json({ ok: false, error: 'Unknown Match Pass plan' }, { status: 400 })
    const successUrl = body?.successUrl || `${origin}/dashboard/buyer?checkout=success`
    const cancelUrl = body?.cancelUrl || `${origin}/dashboard/buyer`

    if (stripeConfigured()) {
      const { data: { user } } = await (await import('@/lib/supabase/client')).supabase.auth.getUser().catch(() => ({ data: { user: null } }))
      const result = await createCheckoutSession({
        agencyId: '',
        items: [{ name: `${plan.name} — monthly`, amountCents: plan.monthly * 100, description: plan.tagline }],
        successUrl,
        cancelUrl,
        customerEmail: user?.email || body?.email || null,
        metadata: { tier, kind: 'buyer_pass' },
      })
      if (result.ok && result.url) return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
      return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
    }

    await subscribeToBuyerPass(tier)
    return NextResponse.json({ ok: true, url: `/dashboard/buyer?checkout=success`, mode: 'demo' })
  }

  // --- Featured listing slot product ------------------------------------------
  if (product === 'featured') {
    const optionId = String(body?.optionId || '').trim()
    const option = FEATURED_SLOT_OPTIONS.find((o) => o.id === optionId)
    const listingId = String(body?.listingId || '').trim()
    const agencyId = String(body?.agencyId || '').trim()
    if (!option || !listingId || !agencyId) {
      return NextResponse.json({ ok: false, error: 'optionId, listingId, and agencyId are required' }, { status: 400 })
    }
    const successUrl = body?.successUrl || `${origin}/dashboard/listings/${listingId}/edit?featured=success`
    const cancelUrl = body?.cancelUrl || `${origin}/dashboard/listings/${listingId}/edit`

    if (stripeConfigured()) {
      const result = await createCheckoutSession({
        agencyId,
        items: [{ name: option.label, amountCents: option.priceCents, description: option.description }],
        successUrl,
        cancelUrl,
        customerEmail: body?.email || null,
        metadata: { kind: 'featured', optionId, listingId },
      })
      if (result.ok && result.url) {
        // Record the slot as pending so the webhook can confirm it.
        await activateFeaturedSlot(agencyId, listingId, optionId, {})
        return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
      }
      return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
    }

    // Demo mode: activate immediately.
    const res = await activateFeaturedSlot(agencyId, listingId, optionId, { immediate: true })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
    return NextResponse.json({ ok: true, url: successUrl, mode: 'demo' })
  }

  const successUrl = body?.successUrl || `${origin}/billing?checkout=success&tier=${tier}`
  const cancelUrl = body?.cancelUrl || `${origin}/billing`

  // Real Stripe path.
  if (stripeConfigured() && plan.monthly > 0) {
    const { data: { user } } = await (await import('@/lib/supabase/client')).supabase.auth.getUser().catch(() => ({ data: { user: null } }))
    const result = await createCheckoutSession({
      agencyId: body?.agencyId || '',
      items: [{ name: `${plan.name} — monthly`, amountCents: plan.monthly * 100, description: plan.tagline }],
      successUrl,
      cancelUrl,
      customerEmail: user?.email || body?.email || null,
      metadata: { tier, kind: 'subscription' },
    })
    if (result.ok && result.url) {
      return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
    }
    return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
  }

  // Demo fallback: record the subscription locally (no charge).
  const email = String(body?.email || '').trim()
  await subscribeToTier(tier, email)
  return NextResponse.json({ ok: true, url: `/billing?checkout=success&tier=${tier}`, mode: 'demo' })
}
