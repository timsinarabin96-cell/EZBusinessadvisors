/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { PLANS, subscribeToTier } from '@/lib/billing'
import { BUYER_PASS_PLANS, subscribeToBuyerPass } from '@/lib/buyerPass'
import { LICENSE_SETUP_CENTS, LICENSE_MONTHLY_CENTS, VERIFIED_REVENUE_PRICE_CENTS, FINANCIAL_INTELLIGENCE_CENTS, VALUATION_PRICE_CENTS, LAUNCH_KIT_PRICE_CENTS, LAUNCH_KIT, OWNER_LISTING_PLANS, FRANCHISE_MONTHLY_CENTS } from '@/lib/pricing'
import { FEATURED_SLOT_OPTIONS, activateFeaturedSlot } from '@/lib/featuredSlots'
import { createCheckoutSession, stripeConfigured, demoModeAllowed, demoBlockedError } from '@/lib/stripeCheckout'

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
  const product = String(body?.product || 'subscription')

  // Only the subscription product maps to a CRM plan. All other products
  // (license, buyer_pass, valuation, featured, verified_revenue,
  // financial_intelligence) handle their own pricing in their branches — the
  // plan check must NOT gate them (was: every non-license product 400'd
  // with 'Unknown plan' before its branch could run).
  const plan = product === 'subscription' ? PLANS.find((p) => p.id === tier) : null
  if (!plan && product === 'subscription') {
    return NextResponse.json({ ok: false, error: 'Unknown plan' }, { status: 400 })
  }

  const origin = req.headers.get('origin') || req.headers.get('referer') || 'http://localhost:3000'
  const product2 = String(body?.product || 'subscription')

  // SECURITY (2026-08-26 audit): successUrl/cancelUrl are client-supplied.
  // Only allow same-origin redirect targets so a crafted checkout can't
  // bounce a user to a phishing site after payment.
  const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || origin
  const safeUrl = (u: unknown, fallback: string): string => {
    const s = String(u || '')
    if (!s) return fallback
    try {
      const parsed = new URL(s)
      const allowed = new URL(APP_ORIGIN)
      return parsed.origin === allowed.origin || s.startsWith('/') ? s : fallback
    } catch {
      return fallback
    }
  }

  // --- Buyer Pass product (separate from brokerage SaaS) ---------------------
  if (product === 'buyer_pass') {
    const tier = String(body?.tier || '').trim()
    const plan = BUYER_PASS_PLANS.find((p) => p.id === tier)
    if (!plan) return NextResponse.json({ ok: false, error: 'Unknown Match Pass plan' }, { status: 400 })
    const successUrl = safeUrl(body?.successUrl, `${origin}/dashboard/buyer?checkout=success`)
    const cancelUrl = safeUrl(body?.cancelUrl, `${origin}/dashboard/buyer`)

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

    if (!demoModeAllowed()) return NextResponse.json(demoBlockedError(), { status: 503 })
    await subscribeToBuyerPass(tier)
    return NextResponse.json({ ok: true, url: `/dashboard/buyer?checkout=success`, mode: 'demo' })
  }

  // --- Verified Revenue badge (bank-vs-books upsell for owner listings) ------
  if (product === 'verified_revenue') {
    const listingId = String(body?.listingId || '').trim()
    const agencyId = String(body?.agencyId || '').trim()
    if (!listingId || !agencyId) {
      return NextResponse.json({ ok: false, error: 'listingId and agencyId are required' }, { status: 400 })
    }
    const successUrl = safeUrl(body?.successUrl, `${origin}/dashboard/listings/${listingId}/edit?verified=success`)
    const cancelUrl = safeUrl(body?.cancelUrl, `${origin}/dashboard/listings/${listingId}/edit`)
    const amount = VERIFIED_REVENUE_PRICE_CENTS

    if (stripeConfigured()) {
      const result = await createCheckoutSession({
        agencyId,
        items: [{ name: 'Verified Revenue badge', amountCents: amount, description: 'Bank-vs-books verification + public ✅ Verified Revenue badge' }],
        successUrl,
        cancelUrl,
        customerEmail: body?.email || null,
        metadata: { kind: 'verified_revenue', listingId },
      })
      if (result.ok && result.url) {
        return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
      }
      return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
    }

    if (!demoModeAllowed()) return NextResponse.json(demoBlockedError(), { status: 503 })
    // Demo mode: grant the badge locally.
    const db = createServerClient()
    if (db) {
      await db.from('public_listings').update({ revenue_verified: true }).eq('listing_id', listingId)
    }
    return NextResponse.json({ ok: true, url: successUrl, mode: 'demo' })
  }

  // --- Franchise Opportunities (Stage 1): $299/mo recurring per brand ------  
  // Flat monthly, no setup fee, no annual option (boss-approved). Payment
  // confirmation (webhook kind='franchise_listing') activates the subscription
  // AND auto-publishes the listing immediately — the AI sanity check runs
  // AFTER publish and only flags issues (never blocks a paid listing).
  if (product === 'franchise_listing') {
    const agencyId = String(body?.agencyId || process.env.VOICE_AGENT_AGENCY_ID || '354facdb-cce2-4eb0-a160-8454854e731a').trim()
    const listingId = String(body?.listingId || '').trim()
    if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })
    const successUrl = safeUrl(body?.successUrl, `${origin}/marketplace/listings/${listingId}?franchise=success`)
    const cancelUrl = safeUrl(body?.cancelUrl, `${origin}/marketplace/sell`)

    if (stripeConfigured()) {
      const result = await createCheckoutSession({
        agencyId,
        mode: 'subscription',
        items: [{
          name: 'Franchise Listing — monthly',
          amountCents: FRANCHISE_MONTHLY_CENTS,
          description: 'Franchise opportunity listing — flat $299/month per brand. Advertise your franchise opportunity; the platform is the advertising surface only (you own your FDD and FTC/state franchise-disclosure compliance).',
          recurringInterval: 'month',
        }],
        successUrl,
        cancelUrl,
        customerEmail: body?.email || null,
        metadata: { kind: 'franchise_listing', listingId, sellerEmail: String(body?.email || '') },
      })
      if (result.ok && result.url) return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
      return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
    }

    if (!demoModeAllowed()) return NextResponse.json(demoBlockedError(), { status: 503 })
    return NextResponse.json({ ok: true, url: successUrl, mode: 'demo' })
  }

  // --- RETIRED 2026-09-01: public $99 valuation product. Removed from sale —
  //     it never delivered a report and the webhook fall-through corrupted
  //     subscription state. The restructured tiers are: free Quick Estimate,
  //     $199/$499 broker sellable reports (honestly labeled), and the $250
  //     AI-Verified Listing (the ONLY tier promising full CIM/BOV/Recast).
  //     The branch below intentionally does not exist; any legacy client that
  //     still POSTs product=valuation gets a clear retired error.
  if (product === 'valuation') {
    return NextResponse.json({ ok: false, error: 'The $99 valuation product has been retired — see the AI-Verified Listing tier for a full CIM/BOV/Recast.' }, { status: 410 })
  }

  // --- AI-Verified Listing ($250 one-time) — public seller checkout ---------
  // The ONLY tier that promises the full CIM/BOV/Recast package. Payment
  // confirmation (webhook kind='seller_listing') marks the seller order paid
  // and auto-triggers the full AI pipeline — no broker intervention.
  if (product === 'seller_listing') {
    const agencyId = String(body?.agencyId || process.env.VOICE_AGENT_AGENCY_ID || '354facdb-cce2-4eb0-a160-8454854e731a').trim()
    const listingId = String(body?.listingId || '').trim()
    const planId = String(body?.planId || 'professional').trim()
    const plan = OWNER_LISTING_PLANS.find((p) => p.id === planId)
    if (!plan || plan.price <= 0) {
      return NextResponse.json({ ok: false, error: 'Invalid listing plan' }, { status: 400 })
    }
    if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })
    const successUrl = safeUrl(body?.successUrl, `${origin}/marketplace/sell?listing=success`)
    const cancelUrl = safeUrl(body?.cancelUrl, `${origin}/marketplace/sell`)

    if (stripeConfigured()) {
      const result = await createCheckoutSession({
        agencyId,
        items: [{ name: `${plan.name} — ${plan.description}`, amountCents: Math.round(plan.price * 100), description: 'Full AI path: advisor interview, document reading, Recast, BOV, CIM and BLI.' }],
        successUrl,
        cancelUrl,
        customerEmail: body?.email || null,
        metadata: { kind: 'seller_listing', listingId, planId, sellerEmail: String(body?.email || '') },
      })
      if (result.ok && result.url) {
        return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
      }
      return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
    }

    if (!demoModeAllowed()) return NextResponse.json(demoBlockedError(), { status: 503 })
    return NextResponse.json({ ok: true, url: successUrl, mode: 'demo' })
  }

  // --- Launch Kit bundle ($399: valuation + featured 30d + verified revenue) -
  if (product === 'launch_kit') {
    const agencyId = String(body?.agencyId || process.env.VOICE_AGENT_AGENCY_ID || '354facdb-cce2-4eb0-a160-8454854e731a').trim()
    const listingId = String(body?.listingId || '').trim()
    const successUrl = safeUrl(body?.successUrl, `${origin}/marketplace/sell?launch=success`)
    const cancelUrl = safeUrl(body?.cancelUrl, `${origin}/marketplace/sell`)

    if (stripeConfigured()) {
      const result = await createCheckoutSession({
        agencyId,
        items: [{ name: LAUNCH_KIT.name, amountCents: LAUNCH_KIT_PRICE_CENTS, description: `${LAUNCH_KIT.blurb} (value $${LAUNCH_KIT.value})` }],
        successUrl,
        cancelUrl,
        customerEmail: body?.email || null,
        metadata: { kind: 'launch_kit', listingId },
      })
      if (result.ok && result.url) {
        return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
      }
      return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
    }

    if (!demoModeAllowed()) return NextResponse.json(demoBlockedError(), { status: 503 })
    return NextResponse.json({ ok: true, url: successUrl, mode: 'demo' })
  }

  // --- Financial Intelligence add-on (the $100/mo upsell) ---------------------
  if (product === 'financial_intelligence') {
    const agencyId = String(body?.agencyId || '').trim()
    if (!agencyId) {
      return NextResponse.json({ ok: false, error: 'agencyId is required' }, { status: 400 })
    }
    const successUrl = safeUrl(body?.successUrl, `${origin}/dashboard/financial-files?addon=success`)
    const cancelUrl = safeUrl(body?.cancelUrl, `${origin}/dashboard/financial-files`)

    if (stripeConfigured()) {
      const result = await createCheckoutSession({
        agencyId,
        mode: 'subscription',
        items: [{ name: 'Financial Intelligence add-on', amountCents: FINANCIAL_INTELLIGENCE_CENTS, description: 'AI financial reader + recast + verification', recurringInterval: 'month' }],
        successUrl,
        cancelUrl,
        customerEmail: body?.email || null,
        metadata: { kind: 'financial_intelligence', tier: 'financial_intelligence' },
      })
      if (result.ok && result.url) {
        return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
      }
      return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
    }

    if (!demoModeAllowed()) return NextResponse.json(demoBlockedError(), { status: 503 })
    // Demo mode: enable the add-on locally.
    const db = createServerClient()
    if (db) {
      await db.from('agency_settings').upsert(
        { agency_id: agencyId, financial_intelligence_enabled: true, updated_at: new Date().toISOString() },
        { onConflict: 'agency_id' },
      )
    }
    return NextResponse.json({ ok: true, url: successUrl, mode: 'demo' })
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
    const successUrl = safeUrl(body?.successUrl, `${origin}/dashboard/listings/${listingId}/edit?featured=success`)
    const cancelUrl = safeUrl(body?.cancelUrl, `${origin}/dashboard/listings/${listingId}/edit`)

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

    if (!demoModeAllowed()) return NextResponse.json(demoBlockedError(), { status: 503 })
    // Demo mode: activate immediately.
    const res = await activateFeaturedSlot(agencyId, listingId, optionId, { immediate: true })
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
    return NextResponse.json({ ok: true, url: successUrl, mode: 'demo' })
  }

  const successUrl = safeUrl(body?.successUrl, `${origin}/billing?checkout=success&tier=${tier}`)
  const cancelUrl = safeUrl(body?.cancelUrl, `${origin}/billing`)

  // --- White-label CRM license: one-time setup + recurring platform fee ------
  if (product === 'license') {
    const agencyId = String(body?.agencyId || '').trim()
    if (!agencyId) {
      return NextResponse.json({ ok: false, error: 'agencyId is required' }, { status: 400 })
    }
    const auth = await authenticateProfileRequest(req)
    if (!auth) return unauthorizedResponse()
    if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

    const licenseSuccessUrl = body?.successUrl || `${origin}/dashboard/agency/settings/billing?license=success`
    const licenseCancelUrl = body?.cancelUrl || `${origin}/dashboard/agency/settings/billing`

    if (stripeConfigured()) {
      const result = await createCheckoutSession({
        agencyId,
        mode: 'subscription',
        items: [
          { name: 'Concord CRM Platform — setup fee', amountCents: LICENSE_SETUP_CENTS, description: 'One-time white-label license setup' },
          { name: 'Concord CRM Platform — platform fee', amountCents: LICENSE_MONTHLY_CENTS, description: 'Monthly platform fee', recurringInterval: 'month' },
        ],
        successUrl: licenseSuccessUrl,
        cancelUrl: licenseCancelUrl,
        customerEmail: body?.email || null,
        metadata: { kind: 'license', tier: 'license' },
      })
      if (result.ok && result.url) {
        return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
      }
      return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
    }

    if (!demoModeAllowed()) return NextResponse.json(demoBlockedError(), { status: 503 })
    // Demo mode: mark the agency licensed locally (no charge).
    const db = createServerClient()
    if (db) {
      await db.from('agencies').update({
        paid_plan_active: true,
        trial_active: false,
        plan_type: 'license',
        locked_at: null,
        archive_at: null,
        grace_end_date: null,
      }).eq('id', agencyId)
    }
    return NextResponse.json({ ok: true, url: licenseSuccessUrl, mode: 'demo' })
  }

  const realSuccessUrl = body?.successUrl || `${origin}/billing?checkout=success&tier=${tier}`
  const realCancelUrl = body?.cancelUrl || `${origin}/billing`

  // Real Stripe path.
  if (stripeConfigured() && plan.monthly > 0) {
    const { data: { user } } = await (await import('@/lib/supabase/client')).supabase.auth.getUser().catch(() => ({ data: { user: null } }))
    const result = await createCheckoutSession({
      agencyId: body?.agencyId || '',
      items: [{ name: `${plan.name} — monthly`, amountCents: plan.monthly * 100, description: plan.tagline }],
      successUrl: realSuccessUrl,
      cancelUrl: realCancelUrl,
      customerEmail: user?.email || body?.email || null,
      metadata: { tier, kind: 'subscription' },
    })
    if (result.ok && result.url) {
      return NextResponse.json({ ok: true, url: result.url, mode: 'stripe' })
    }
    return NextResponse.json({ ok: false, error: result.error || 'Checkout failed' }, { status: 500 })
  }

  if (!demoModeAllowed()) return NextResponse.json(demoBlockedError(), { status: 503 })
  // Demo fallback: record the subscription locally (no charge).
  const email = String(body?.email || '').trim()
  await subscribeToTier(tier, email)
  return NextResponse.json({ ok: true, url: `/billing?checkout=success&tier=${tier}`, mode: 'demo' })
}
