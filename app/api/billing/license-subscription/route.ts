/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { fetchLicenseByAgency, updateLicenseSeatsOnStripe, setLicenseCancelAtPeriodEnd } from '@/lib/licenseSubscriptions'
import { stripeConfigured } from '@/lib/stripeCheckout'
import { type LicenseBillingCycle, seatAddonQty, licenseTotalCents, licenseSeatAddonCents } from '@/lib/licenseSubscriptionsCore'
import { LICENSE_SEATS_INCLUDED } from '@/lib/pricing'

export const runtime = 'nodejs'

/**
 * GET /api/billing/license-subscription?agencyId=...
 * Returns the agency's license subscription + derived billing summary.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

  const license = await fetchLicenseByAgency(agencyId)
  if (!license) {
    return NextResponse.json({ ok: true, license: null })
  }

  return NextResponse.json({
    ok: true,
    license,
    summary: {
      planType: license.plan_type,
      billingCycle: license.billing_cycle,
      seats: license.seats,
      addonQty: seatAddonQty(license.seats),
      totalCents: licenseTotalCents(license.plan_type, license.billing_cycle, license.seats),
      seatAddonCents: licenseSeatAddonCents(license.billing_cycle),
      includedSeats: LICENSE_SEATS_INCLUDED,
    },
  })
}

/**
 * PATCH /api/billing/license-subscription
 * body: { agencyId, action: 'seats'|'cancel'|'resume', seats?: number }
 *   - seats:  change seat count (prorated on Stripe when configured)
 *   - cancel: cancel at period end (access continues to period end)
 *   - resume: undo cancel-at-period-end
 */
export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body.agencyId || '')
  const action = String(body.action || '')
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

  const license = await fetchLicenseByAgency(agencyId)
  if (!license) return NextResponse.json({ ok: false, error: 'No subscription yet' }, { status: 404 })

  const cycle: LicenseBillingCycle = license.billing_cycle === 'annual' ? 'annual' : 'monthly'

  try {
    if (action === 'seats') {
      const seats = Math.max(LICENSE_SEATS_INCLUDED, Math.min(100, parseInt(String(body.seats ?? license.seats), 10) || license.seats))
      if (seats === license.seats) {
        return NextResponse.json({ ok: true, license, unchanged: true })
      }
      if (stripeConfigured() && license.stripe_subscription) {
        await updateLicenseSeatsOnStripe(license.stripe_subscription, cycle, seats)
      }
      const { data } = await db.from('licenses').update({ seats, updated_at: new Date().toISOString() }).eq('id', license.id).select().maybeSingle()
      return NextResponse.json({ ok: true, license: data })
    }

    if (action === 'cancel' || action === 'resume') {
      const cancel = action === 'cancel'
      let cancelAt: string | null = null
      if (stripeConfigured() && license.stripe_subscription) {
        const res = await setLicenseCancelAtPeriodEnd(license.stripe_subscription, cancel)
        cancelAt = res.cancelAt
      }
      const { data } = await db.from('licenses').update({
        cancel_at_period_end: cancel,
        cancel_at: cancelAt,
        updated_at: new Date().toISOString(),
      }).eq('id', license.id).select().maybeSingle()
      return NextResponse.json({ ok: true, license: data })
    }

    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 })
  }
}
