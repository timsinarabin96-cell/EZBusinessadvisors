/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// =============================================================================
// PATCH /api/owner/listings/[id]/status — seller controls their listing:
//   { action: 'sold' | 'pause' | 'withdraw' | 'reactivate' }
//   sold      → status 'sold' (feed removes it, lifecycle runs)
//   pause     → status 'draft' (hidden from the public feed, kept for later)
//   withdraw  → status 'withdrawn' (permanent)
//   reactivate→ runs the FULL publish pipeline (readiness + legitimacy gate) —
//               only auto-approved listings can come back live.
// Owner auth: listing.owner_email must match the signed-in user's email, or a
// seller_listing_orders row must link the user's email to the listing.
// =============================================================================

const ACTIONS = ['sold', 'pause', 'withdraw', 'reactivate'] as const
type Action = (typeof ACTIONS)[number]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  const { data: { user } } = await svc.auth.getUser()
  if (!user?.email) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }
  const action = String(body?.action || '') as Action
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, error: `Action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
  }

  const { data: listing } = await svc.from('listings').select('id, owner_email, status, business_name').eq('id', id).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  // Owner authorization: email on the listing, or a matching seller order.
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

  // Reactivate goes through the full publish pipeline (readiness + legitimacy).
  if (action === 'reactivate') {
    const { publishListing } = await import('@/lib/publish')
    const result = await publishListing(id, user.id)
    if (!result.ok) {
      return NextResponse.json({ ok: false, blocked: true, error: result.error || 'Could not reactivate', missing: result.missing, score: result.score }, { status: 422 })
    }
    return NextResponse.json({ ok: true, status: 'active', message: 'Your listing is live again.' })
  }

  const statusMap: Record<Action, string> = { sold: 'sold', pause: 'draft', withdraw: 'withdrawn', reactivate: 'active' }
  const { error } = await svc.from('listings').update({ status: statusMap[action] }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const messages: Record<Action, string> = {
    sold: 'Listing marked as sold. It has been removed from the public feed.',
    pause: 'Listing paused — hidden from the public feed. Reactivate anytime.',
    withdraw: 'Listing withdrawn.',
    reactivate: 'Listing is live again.',
  }
  return NextResponse.json({ ok: true, status: statusMap[action], message: messages[action] })
}
