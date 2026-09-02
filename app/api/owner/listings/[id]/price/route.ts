/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/owner/listings/[id]/price — seller requests a price change.
// The compliance gate on money stays intact: this NEVER writes asking_price
// directly. It stores a pending request on listings.ai_metadata
// (pending_price_change) for a broker to approve/reject from the existing
// review-queue surface (app/dashboard/review-queue). See
// app/api/listings/[id]/price/approve for the broker side.
// =============================================================================

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  const auth = await authenticateRequest(req)
  if (!auth?.user?.id) return unauthorizedResponse('Sign in required')
  const user = auth.user

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }
  const askingPrice = Number(body?.asking_price)
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : null
  if (!Number.isFinite(askingPrice) || askingPrice <= 0) {
    return NextResponse.json({ ok: false, error: 'asking_price is required and must be greater than 0' }, { status: 400 })
  }

  const { data: listing } = await svc
    .from('listings')
    .select('id, owner_email, business_name, asking_price, ai_metadata')
    .eq('id', id)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const ownsListing =
    listing.owner_email === user.email ||
    (await svc
      .from('seller_listing_orders')
      .select('id')
      .eq('listing_id', id)
      .eq('seller_email', user.email)
      .maybeSingle()
      .then((r) => Boolean(r.data)))
  if (!ownsListing) {
    return NextResponse.json({ ok: false, error: 'You do not own this listing' }, { status: 403 })
  }

  const meta = (listing.ai_metadata || {}) as Record<string, unknown>
  const pendingPriceChange = {
    asking_price: askingPrice,
    previous_asking_price: listing.asking_price ?? null,
    reason: reason || null,
    requested_at: new Date().toISOString(),
    requested_by: user.id,
  }

  // Do NOT touch asking_price — write the pending request only.
  const { error } = await svc
    .from('listings')
    .update({ ai_metadata: { ...meta, pending_price_change: pendingPriceChange } })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  try {
    const { recordAdminAudit } = await import('@/lib/adminAudit')
    await recordAdminAudit({
      actorId: user.id,
      actorEmail: user.email || null,
      action: 'owner_requested_price_change',
      targetType: 'listing',
      targetId: id,
      targetLabel: listing.business_name || null,
      details: { requested_asking_price: askingPrice, previous_asking_price: listing.asking_price ?? null, reason: reason || null },
    })
  } catch { /* audit is best-effort */ }

  return NextResponse.json({
    ok: true,
    pending: pendingPriceChange,
    message: 'Price change submitted for broker review. Your listed price stays the same until approved.',
  })
}
