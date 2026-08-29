/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { createCheckoutSession, stripeConfigured } from '@/lib/stripeCheckout'

export const runtime = 'nodejs'

/**
 * POST /api/billing/checkout
 * body: { items: [{name, amountCents, quantity?, description?}],
 *         successUrl, cancelUrl, metadata?, customerEmail? }
 * Creates a Stripe Checkout session. Returns a clear error when Stripe isn't configured.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  if (!stripeConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Stripe is not connected yet. Add STRIPE_SECRET_KEY to enable live payments.' },
      { status: 503 },
    )
  }

  const result = await createCheckoutSession({
    agencyId,
    items: body.items || [],
    successUrl: body.successUrl || `${req.nextUrl.origin}/dashboard/store?checkout=success`,
    cancelUrl: body.cancelUrl || `${req.nextUrl.origin}/dashboard/store?checkout=cancelled`,
    metadata: body.metadata || {},
    customerEmail: body.customerEmail || auth.user.email,
  })

  if (!result.ok || !result.url) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, url: result.url })
}
