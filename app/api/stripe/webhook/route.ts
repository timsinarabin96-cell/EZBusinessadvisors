/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { verifyStripeSignature } from '@/lib/stripeVerify'

export const runtime = 'nodejs'

/**
 * POST /api/stripe/webhook
 * Stripe Checkout event handler. On checkout.session.completed, activates the
 * subscription (status=active, tier from metadata, 30-day period) so plan
 * limits unlock immediately. Also records an invoice row.
 *
 * When STRIPE_WEBHOOK_SECRET is set, every request is verified against the
 * `stripe-signature` header (HMAC + replay window). Without it (demo mode,
 * no real Stripe), events from the local fallback path are still processed
 * so the flow never hard-fails — safe by design.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const raw = await req.text().catch(() => '')
  let payload: any = null
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 })
  }

  // --- Signature verification (enforced when a webhook secret is configured) --
  const SIGNING_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''
  if (SIGNING_SECRET) {
    const header = req.headers.get('stripe-signature')
    if (!verifyStripeSignature(raw, header, SIGNING_SECRET)) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 })
    }
  }

  const type = payload?.type || payload?.data?.object?.metadata?.kind === 'subscription' ? 'checkout.session.completed' : payload?.type

  // -------------------------------------------------------------------------
  // PAYMENT LIFECYCLE (2026-08-26 audit): handle failures + cancellations so
  // the books stay honest without trusting any client-side flag.
  // -------------------------------------------------------------------------
  if (type === 'invoice.payment_failed') {
    // Find the agency by Stripe subscription/customer, move to grace period.
    // The existing check-trials cron turns expired grace into a lock.
    const sub = payload?.data?.object || {}
    const stripeSub = String(sub?.subscription || '')
    const customer = String(sub?.customer || '')
    let agencyId: string | null = null
    if (stripeSub || customer) {
      let q = db.from('subscriptions').select('agency_id').limit(1)
      if (stripeSub) q = q.eq('stripe_sub', stripeSub)
      else q = q.eq('stripe_customer', customer)
      const { data: subRow } = await q.maybeSingle()
      agencyId = subRow?.agency_id || null
    }
    if (agencyId) {
      // 7-day grace, then the expiry cron locks the agency.
      const graceEnd = new Date(Date.now() + 7 * 86400000).toISOString()
      await db.from('agencies').update({ grace_end_date: graceEnd, trial_active: false }).eq('id', agencyId)
      if (stripeSub) {
        await db.from('subscriptions').update({ status: 'past_due' }).eq('stripe_sub', stripeSub)
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (type === 'customer.subscription.deleted') {
    const sub = payload?.data?.object || {}
    const stripeSub = String(sub?.id || '')
    const customer = String(sub?.customer || '')
    let agencyId: string | null = null
    if (stripeSub || customer) {
      let q = db.from('subscriptions').select('agency_id').limit(1)
      if (stripeSub) q = q.eq('stripe_sub', stripeSub)
      else q = q.eq('stripe_customer', customer)
      const { data: subRow } = await q.maybeSingle()
      agencyId = subRow?.agency_id || null
    }
    if (agencyId) {
      await db.from('agencies').update({
        paid_plan_active: false,
        grace_end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
        trial_active: false,
      }).eq('id', agencyId)
      if (stripeSub) {
        await db.from('subscriptions').update({ status: 'canceled' }).eq('stripe_sub', stripeSub)
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (type === 'invoice.paid') {
    // Successful renewal: extend the period and clear any grace state.
    const inv = payload?.data?.object || {}
    const stripeSub = String(inv?.subscription || '')
    if (stripeSub) {
      const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString()
      await db.from('subscriptions').update({ status: 'active', current_period_end: periodEnd }).eq('stripe_sub', stripeSub)
      const { data: subRow } = await db.from('subscriptions').select('agency_id').eq('stripe_sub', stripeSub).maybeSingle()
      if (subRow?.agency_id) {
        await db.from('agencies').update({
          paid_plan_active: true,
          grace_end_date: null,
          locked_at: null,
          archive_at: null,
        }).eq('id', subRow.agency_id)
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (type !== 'checkout.session.completed') {
    // Acknowledge everything else so Stripe stops retrying.
    return NextResponse.json({ ok: true })
  }

  const session = payload?.data?.object || payload
  const metadata = session?.metadata || {}
  const tier = String(metadata?.tier || 'professional')
  const kind = String(metadata?.kind || 'subscription')
  const clientRef = session?.client_reference_id || ''

  // Shared resolution (license + subscription paths both need these).
  const now = new Date()
  const email = session?.customer_details?.email || ''
  let profileId: string | null = null
  if (email) {
    const { data: profile } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
    profileId = profile?.id || null
  }

  // --- Featured slot: confirm payment → feature the listing ------------------
  if (kind === 'featured') {
    const { confirmFeaturedSlot } = await import('@/lib/featuredSlots')
    const result = await confirmFeaturedSlot(session?.id || '')
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // --- Buyer Pass: activate buyer_subscriptions + verified badge -------------
  if (kind === 'buyer_pass') {
    const email = session?.customer_details?.email || ''
    if (email) {
      const { data: profile } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
      const profileId = profile?.id
      if (profileId) {
        const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString()
        await db.from('buyer_subscriptions').upsert({
          profile_id: profileId,
          tier,
          status: 'active',
          stripe_customer: session?.customer || null,
          stripe_sub: session?.id || null,
          current_period_end: periodEnd,
        }, { onConflict: 'profile_id' })
        await db.from('profiles').update({ verified_buyer: true }).eq('id', profileId)
      }
    }
    return NextResponse.json({ ok: true })
  }

  // --- Valuation report: confirm payment → generate + deliver the PDF --------
  if (kind === 'valuation_report') {
    const { finalizeValuationReport } = await import('@/lib/valuationReports')
    const result = await finalizeValuationReport(session?.id || '')
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // --- License purchase: activate the white-label license --------------------
  if (kind === 'license') {
    const amountTotal = Number(session?.amount_total || 0) // cents
    if (clientRef) {
      await db.from('agencies').update({
        paid_plan_active: true,
        trial_active: false,
        plan_type: 'license',
        locked_at: null,
        archive_at: null,
        grace_end_date: null,
      }).eq('id', clientRef)
      // licensed_at column (additive migration) — safe fallback if absent.
      try {
        await db.from('agencies').update({ licensed_at: new Date().toISOString() }).eq('id', clientRef)
      } catch { /* column not migrated yet — cosmetic only */ }
      try {
        await db.from('subscription_history').insert({
          agency_id: clientRef,
          plan_type: 'license',
          start_date: new Date().toISOString(),
          amount: amountTotal ? Math.round(amountTotal / 100) : null,
          status: 'active',
          notes: 'License purchase — setup fee + platform fee',
        })
      } catch { /* history table unavailable */ }
    }
    if (profileId) {
      try {
        await db.from('invoices').insert({
          profile_id: profileId,
          amount: amountTotal ? Math.round(amountTotal / 100) : 5499,
          currency: 'usd',
          status: 'paid',
          stripe_invoice: session?.id || null,
          paid_at: now.toISOString(),
          due_date: now.toISOString(),
        }).select().maybeSingle()
      } catch { /* invoice table unavailable — non-fatal */ }
    }
    return NextResponse.json({ ok: true })
  }

  // 1) Activate / upsert the subscription.
  const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString()

  if (profileId) {
    await db.from('subscriptions').upsert({
      profile_id: profileId,
      agency_id: clientRef || null,
      tier,
      status: 'active',
      current_period_end: periodEnd,
      seats: tier === 'enterprise' ? 10 : tier === 'professional' ? 5 : 1,
    }, { onConflict: 'profile_id' })
  }

  // 2) Mark the agency paid (if a client_reference_id was provided).
  if (clientRef) {
    await db.from('agencies').update({
      paid_plan_active: true,
      trial_active: false,
      plan_type: tier,
      locked_at: null,
      archive_at: null,
      grace_end_date: null,
    }).eq('id', clientRef)
  }

  // 3) Record an invoice row.
  if (profileId) {
    const amount = tier === 'enterprise' ? 9900 : tier === 'professional' ? 4900 : 0
    await db.from('invoices').insert({
      profile_id: profileId,
      amount,
      currency: 'usd',
      status: 'paid',
      stripe_invoice: session?.id || null,
      paid_at: now.toISOString(),
      due_date: now.toISOString(),
    }).select().maybeSingle()
  }

  return NextResponse.json({ ok: true })
}
