/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * POST /api/track-view — anonymous listing view event.
 * Body: { listing_id, visitor_id, referrer? }
 * The server resolves agency_id from the listing so anonymous clients never
 * guess tenant boundaries. Fire-and-forget from the public listing page.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => null)
  const listingId = body?.listing_id
  const visitorId = body?.visitor_id
  if (!listingId || !visitorId) {
    return NextResponse.json({ ok: false, error: 'listing_id and visitor_id required' }, { status: 400 })
  }

  const { data: listing } = await db
    .from('listings')
    .select('id, agency_id')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'listing not found' }, { status: 404 })

  const { error } = await db.from('listing_views').insert({
    listing_id: listingId,
    agency_id: listing.agency_id || null,
    visitor_id: visitorId,
    referrer: body?.referrer || null,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
