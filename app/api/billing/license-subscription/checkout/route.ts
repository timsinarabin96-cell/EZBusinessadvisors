/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createLicenseCheckout } from '@/lib/licenseSubscriptions'
import { type LicensePlanType, type LicenseBillingCycle, seatAddonQty, licenseTotalCents, licenseSeatAddonCents } from '@/lib/licenseSubscriptionsCore'
import { LICENSE_SEATS_INCLUDED } from '@/lib/pricing'

export const runtime = 'nodejs'

/**
 * POST /api/billing/license-subscription/checkout
 * body: { agencyId, planType: 'professional'|'enterprise',
 *         billingCycle: 'monthly'|'annual', seats: number }
 * Creates a Stripe Checkout session for the recurring CRM subscription
 * (base plan qty 1 + seat add-ons qty N-3). Redirects the browser to Stripe.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body.agencyId || '')
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

  const planType: LicensePlanType = body.planType === 'enterprise' ? 'enterprise' : 'professional'
  const billingCycle: LicenseBillingCycle = body.billingCycle === 'annual' ? 'annual' : 'monthly'
  const seats = Math.max(LICENSE_SEATS_INCLUDED, Math.min(100, parseInt(String(body.seats || LICENSE_SEATS_INCLUDED), 10) || LICENSE_SEATS_INCLUDED))

  const origin = req.headers.get('origin') || req.headers.get('referer') || 'http://localhost:3000'
  const successUrl = `${origin}/dashboard/agency/settings/billing?license=success`
  const cancelUrl = `${origin}/dashboard/agency/settings/billing`

  // Reuse the existing Stripe customer if this agency already has one, so a
  // plan/cycle/seat change on a live subscription keeps one customer record.
  const { data: existing } = await db.from('licenses').select('stripe_customer, stripe_subscription').eq('agency_id', agencyId).maybeSingle()

  const result = await createLicenseCheckout({
    agencyId,
    planType,
    billingCycle,
    seats,
    successUrl,
    cancelUrl,
    customerEmail: auth.user.email,
    customer: existing?.stripe_customer || null,
  })

  if (!result.ok || !result.url) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({
    ok: true,
    url: result.url,
    summary: {
      planType,
      billingCycle,
      seats,
      addonQty: seatAddonQty(seats),
      totalCents: licenseTotalCents(planType, billingCycle, seats),
      seatAddonCents: licenseSeatAddonCents(billingCycle),
    },
  })
}
