/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { verifyStripeSignature } from '@/lib/stripeVerify'
import { LICENSE_SETUP_FEE, CRM_PLANS } from '@/lib/pricing'
import { syncLicenseFromStripeSubscription, handleLicenseSubscriptionDeleted, fetchLicenseByStripeSub, syncAgencyAccessFromLicense } from '@/lib/licenseSubscriptions'
import { licenseAccessGranted } from '@/lib/licenseSubscriptionsCore'
import { sendEmail } from '@/lib/email'

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
  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
    // Phase 3: recurring CRM license subscriptions — sync the licenses row
    // (status, seats, period, cancel-at-period-end) from Stripe, then unlock
    // or lock the agency to match. Handles prorated seat changes too.
    const sub = payload?.data?.object || {}
    try {
      const saved = await syncLicenseFromStripeSubscription(sub)
      if (saved?.agency_id && licenseAccessGranted(saved.status)) {
        await db.from('agencies').update({
          paid_plan_active: true,
          trial_active: false,
          plan_type: 'license',
          locked_at: null,
          archive_at: null,
          grace_end_date: null,
        }).eq('id', saved.agency_id)
      }
    } catch { /* sync is best-effort; checkout.completed also unlocks */ }
    return NextResponse.json({ ok: true })
  }

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
    // Phase 3: license subscriptions → mark past_due + grace.
    if (!agencyId && stripeSub) {
      const license = await fetchLicenseByStripeSub(stripeSub)
      if (license) {
        agencyId = license.agency_id
        await db.from('licenses').update({ status: 'past_due', updated_at: new Date().toISOString() }).eq('id', license.id)
      }
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
    // Phase 3: license subscriptions → cancel the license row + revoke access.
    if (stripeSub) {
      const license = await fetchLicenseByStripeSub(stripeSub)
      if (license) {
        agencyId = agencyId || license.agency_id
        await handleLicenseSubscriptionDeleted(stripeSub)
      }
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
    // Phase 3: license subscription renewal — extend period, clear grace.
    if (stripeSub) {
      const license = await fetchLicenseByStripeSub(stripeSub)
      if (license) {
        const periodEnd = inv?.period_end ? new Date(inv.period_end * 1000).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString()
        await db.from('licenses').update({ status: 'active', current_period_end: periodEnd, updated_at: new Date().toISOString() }).eq('id', license.id)
        await syncAgencyAccessFromLicense(license.agency_id, 'active')
      }
    }
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

  // --- Verified Revenue badge: confirm payment → flag for bank-vs-books -------
  if (kind === 'verified_revenue') {
    const listingId = String(metadata?.listingId || clientRef || '')
    if (listingId) {
      // Mark the verified record so the admin AI verify flow can finish it.
      const { data: existing } = await db.from('verified_financials').select('id').eq('listing_id', listingId).maybeSingle()
      if (existing) {
        await db.from('verified_financials').update({
          status: 'connected',
          verified_revenue_basis: 'bank_deposits',
        }).eq('listing_id', listingId)
      } else {
        await db.from('verified_financials').insert({
          listing_id: listingId,
          agency_id: null,
          status: 'connected',
          verified_revenue_basis: 'bank_deposits',
        })
      }
    }
    return NextResponse.json({ ok: true })
  }

  // --- Financial Intelligence add-on: confirm payment → enable per agency -----
  if (kind === 'financial_intelligence') {
    if (clientRef) {
      await db.from('agency_settings').upsert(
        { agency_id: clientRef, financial_intelligence_enabled: true, updated_at: now.toISOString() },
        { onConflict: 'agency_id' },
      )
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

  // --- RETIRED public $99 valuation (2026-09-01): the old kind='valuation'
  //     checkout fell through to the subscription block below, silently
  //     activating a Professional subscription for a $99 purchase. The product
  //     is pulled from sale; if any legacy session still completes, absorb it
  //     here as a no-op (log + refund-free ack) so it can NEVER touch
  //     subscription/agency state again.
  if (kind === 'valuation') {
    try {
      // Best-effort: refund the retired product so nobody pays for nothing.
      const { refundCheckoutSession } = await import('@/lib/stripeCheckout')
      const r = await refundCheckoutSession(session?.id || '', { reason: 'product_retired' })
      console.warn('[store] retired $99 valuation checkout completed — refunded:', r.ok, r.refundId || r.error)
    } catch { /* refund is best-effort */ }
    return NextResponse.json({ ok: true })
  }

  // --- AI-Verified Listing ($250): mark the seller order paid + auto-run the
  //     full AI pipeline (record → docs → recast → BOV → CIM → BLI → SBA →
  //     workflow). Zero broker intervention — payment IS the authorization.
  if (kind === 'seller_listing') {
    const listingId = String(metadata?.listingId || '')
    const planId = String(metadata?.planId || 'professional')
    const sellerEmail = String(metadata?.sellerEmail || email || '')
    let agencyId = String(metadata?.agencyId || clientRef || '')

    try {
      // Resolve agency from the listing if not in metadata.
      if (!agencyId && listingId) {
        const { data: l } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
        agencyId = String(l?.agency_id || '')
      }

      // 1) Mark the seller order paid.
      if (listingId) {
        await db.from('seller_listing_orders')
          .update({ status: 'paid', provider: 'stripe', provider_session_id: session?.id || null })
          .eq('listing_id', listingId)
      }

      // 2) Upgrade the listing tier + unlock the AI path.
      if (listingId) {
        await db.from('listings').update({
          seller_tier: 'paid',
          tier_paid_at: now.toISOString(),
          ai_readiness_score: 100,
          compliance_status: 'pending',
          updated_at: now.toISOString(),
        }).eq('id', listingId)
      }

      // 3) Auto-run the full AI pipeline (fire-and-forget with a generous
      //    timeout — doc reading + 4 PDF generations can take a while).
      if (listingId) {
        const { runPaidListingPipeline } = await import('@/lib/paidListingPipeline')
        runPaidListingPipeline({ listingId, planId, sellerEmail, agencyId }).catch((e: any) => {
          console.error('[store] AI-Verified pipeline failed:', e?.message || e)
        })
      }
    } catch (e: any) {
      console.error('[store] seller_listing webhook error:', e?.message || e)
    }
    return NextResponse.json({ ok: true })
  }

  // --- Recurring CRM subscription (Phase 3): create/refresh the licenses row --
  if (kind === 'license_subscription') {
    const agencyId = String(metadata?.agencyId || clientRef || '')
    const planType = metadata?.planType === 'enterprise' ? 'enterprise' : 'professional'
    const billingCycle = metadata?.billingCycle === 'annual' ? 'annual' : 'monthly'
    const seats = Math.max(3, parseInt(String(metadata?.seats || '3'), 10) || 3)
    const periodStart = session?.current_period_start ? new Date(session.current_period_start * 1000).toISOString() : now.toISOString()
    const periodEnd = session?.current_period_end ? new Date(session.current_period_end * 1000).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString()

    if (agencyId) {
      await db.from('licenses').upsert({
        agency_id: agencyId,
        plan_type: planType,
        billing_cycle: billingCycle,
        status: 'active',
        seats,
        stripe_customer: session?.customer || null,
        stripe_subscription: session?.subscription || null,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        cancel_at: null,
        updated_at: now.toISOString(),
      }, { onConflict: 'agency_id' })

      // Unlock the agency immediately (access granted on payment success).
      await db.from('agencies').update({
        paid_plan_active: true,
        trial_active: false,
        plan_type: 'license',
        locked_at: null,
        archive_at: null,
        grace_end_date: null,
      }).eq('id', agencyId)

      // History entry (best-effort).
      try {
        await db.from('subscription_history').insert({
          agency_id: agencyId,
          plan_type: planType,
          start_date: periodStart,
          end_date: periodEnd,
          amount: session?.amount_total ? Math.round(session.amount_total / 100) : null,
          status: 'active',
          notes: `CRM subscription — ${billingCycle} · ${seats} seats (3 included + ${seats - 3} add-on)`,
        })
      } catch { /* history is informational */ }
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
          amount: amountTotal ? Math.round(amountTotal / 100) : LICENSE_SETUP_FEE,
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

  // --- Marketing Materials Store: confirm payment → record order + profit ---
  // and AUTO-SEND the supplier work order (fully hands-off for the owner).
  if (kind === 'store_order') {
    const productId = String(metadata?.productId || '')
    const productName = String(metadata?.productName || 'Store product')
    const quantity = Math.max(1, parseInt(String(metadata?.quantity || '1'), 10) || 1)
    const artworkUrl = String(metadata?.artworkUrl || '').trim() || null
    const designMode = String(metadata?.designMode || 'auto').trim()
    const ship = {
      name: String(metadata?.shipName || ''),
      line1: String(metadata?.shipLine1 || ''),
      line2: String(metadata?.shipLine2 || ''),
      city: String(metadata?.shipCity || ''),
      state: String(metadata?.shipState || ''),
      zip: String(metadata?.shipZip || ''),
    }
    const { data: product } = productId
      ? await db.from('store_products').select('*').eq('id', productId).maybeSingle()
      : { data: null }
    const unitCost = Number(product?.cost_price || 0)
    const unitSell = Number(product?.sell_price || 0)
    const subtotal = Math.round(unitSell * quantity * 100) / 100
    const costTotal = Math.round(unitCost * quantity * 100) / 100
    const profit = Math.round((subtotal - costTotal) * 100) / 100
    const workOrderRef = `WO-${Date.now().toString(36).toUpperCase()}`

    const { data: orderRow, error: orderErr } = await db.from('store_orders').insert({
      user_id: profileId,
      agency_id: clientRef || null,
      product_id: productId || null,
      product_name: productName,
      quantity,
      unit_cost: unitCost,
      unit_sell: unitSell,
      subtotal,
      cost_total: costTotal,
      profit,
      shipping_address: ship,
      status: 'paid',
      work_order_ref: workOrderRef,
      stripe_session_id: session?.id || null,
      artwork_url: artworkUrl,
      design_mode: designMode,
      buyer_email: email || null,
    }).select().maybeSingle()
    if (orderErr) {
      return NextResponse.json({ ok: false, error: `order insert failed: ${orderErr.message}` }, { status: 500 })
    }

    // Artwork handling for the supplier:
    //  - upload mode: the broker's own template IS the print file — ship as-is.
    //  - AI mode: the AI art is the background; a print-ready PDF with REAL
    //    overlaid text is generated so nothing ships with AI-garbled type.
    //  - no artwork: fall back to the fully auto-generated branded PDF.
    // Failures never block the order.
    let printFileUrl: string | null = null
    try {
      const { createAndUploadPrintFile } = await import('@/lib/storePrintFiles')
      const { url } = await createAndUploadPrintFile({
        orderId: orderRow.id,
        workOrderRef,
        productName,
        category: String(product?.category || 'flyers'),
        quantity,
        shipTo: ship,
        businessName: productName,
        headline: 'Confidential Business Opportunity',
        contact: { name: 'EZ Business Advisors', phone: '', email: email || '', website: 'ezbusinessadvisors.com' },
        brand: { name: 'CONCORD Deal Platform' },
        backgroundImageUrl: designMode === 'ai' ? artworkUrl : undefined,
      })
      printFileUrl = url || null
    } catch { /* print file is best-effort */ }
    if (designMode === 'upload' && artworkUrl) {
      printFileUrl = artworkUrl
    }
    if (printFileUrl) {
      await db.from('store_orders').update({ print_file_url: printFileUrl }).eq('id', orderRow.id)
    }

    // Buyer receipt (fire-and-forget) — instant confirmation with order details.
    if (email) {
      sendEmail({
        to: email,
        subject: `Receipt — ${productName} × ${quantity} (${workOrderRef})`,
        html:
          `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
          `<div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff">` +
          `<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">CONCORD Deal Platform</div>` +
          `<div style="font-size:12px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">Order Receipt</div></div>` +
          `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
          `<div style="font-size:13px;color:#999">${new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>` +
          `<div style="font-size:18px;font-weight:800;color:#1a1a2e;font-family:Georgia,serif;margin:4px 0 12px">${productName} × ${quantity}</div>` +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#2a2a2a">` +
          `<tr><td style="padding:5px 0;color:#888">Order ref</td><td style="padding:5px 0;font-weight:700">${workOrderRef}</td></tr>` +
          `<tr><td style="padding:5px 0;color:#888">Ship to</td><td style="padding:5px 0;font-weight:700">${ship.name} — ${ship.line1}${ship.line2 ? ', ' + ship.line2 : ''}, ${ship.city}, ${ship.state} ${ship.zip}</td></tr>` +
          `<tr><td style="padding:5px 0;color:#888">Total paid</td><td style="padding:5px 0;font-weight:800;color:#16a34a">${'$' + subtotal.toFixed(2)}</td></tr>` +
          `</table>` +
          `<div style="border-top:1px solid #e5e0d3;margin:12px 0"></div>` +
          `<div style="font-size:13px;color:#555;line-height:1.6">Your order is in production. Print + shipping are handled for you — we'll update you when it ships.</div>` +
          `</div>` +
          `<p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">Questions? Contact <a href="mailto:${process.env.STORE_OWNER_EMAIL || 'rtimsina@ezbusinessadvisors.com'}" style="color:#c9a84c">${process.env.STORE_OWNER_EMAIL || 'rtimsina@ezbusinessadvisors.com'}</a></p></div>`,
        kind: 'generic',
        meta: { store_receipt: true, order_id: orderRow.id, work_order_ref: workOrderRef },
      }).catch(() => {})
    }

    // Auto-send the work order to the right supplier (fire-and-forget).
    // Product-level supplier (4over / Printify / GotPrint) routes automatically.
    const { dispatchStoreWorkOrder } = await import('@/lib/storeWorkOrder')
    await dispatchStoreWorkOrder({
      orderId: orderRow.id,
      workOrderRef,
      productName,
      quantity,
      unitCost,
      supplier: product?.supplier || null,
      printFileUrl,
      shipping: ship,
      customerEmail: email,
    }).catch(() => {})

    // Mark work_order_sent only when the supplier email is configured.
    const { data: supplierCfg } = await db.from('store_settings').select('value').eq('key', 'supplier_email').maybeSingle()
    if (supplierCfg?.value) {
      await db.from('store_orders').update({ status: 'work_order_sent' }).eq('id', orderRow.id)
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
    const plan = CRM_PLANS.find((p) => p.id === tier)
    const amount = plan ? plan.monthly * 100 : 0
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
