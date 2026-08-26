/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { fetchListingForMatch, scoreMatch, type BuyerProfile } from '@/lib/buyerMatching'

export const runtime = 'nodejs'

/**
 * GET /api/deals/buyer-scorecards?listingId=... — ranked buyer scorecards
 * for a deal's listing. Zero-token match engine: industry/location/price/
 * revenue/SDE fit → 0-100 score per buyer with reasons. Brokers see who to
 * call first, right in the pipeline.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  // Verify the caller manages the listing's agency.
  const { data: listing } = await db.from('listings').select('id, agency_id').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(authenticated, listing.agency_id)) return forbiddenResponse()

  const matchListing = await fetchListingForMatch(listingId)
  if (!matchListing) return NextResponse.json({ ok: false, error: 'Listing match data unavailable' }, { status: 404 })

  // Pull active buyer search profiles for the agency (with contact info).
  const { data: buyers } = await db
    .from('buyer_search_profiles')
    .select('id, agency_id, email, name, phone, industries, locations, min_price, max_price, min_revenue, min_sde, notification_email, notification_sms, ai_match_enabled, active')
    .eq('agency_id', listing.agency_id)
    .eq('active', true)
    .eq('ai_match_enabled', true)
    .limit(200)

  const scorecards = ((buyers || []) as BuyerProfile[])
    .map((buyer) => {
      const match = scoreMatch(buyer, matchListing)
      if (!match) return null
      return {
        buyerId: buyer.id,
        name: buyer.name || null,
        email: buyer.email || null,
        phone: (buyer as any).phone || null,
        industries: buyer.industries || [],
        locations: buyer.locations || [],
        score: match.match_score,
        reasons: (match.matched_on?.reasons as string[]) || [],
      }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  return NextResponse.json({
    ok: true,
    listingId,
    buyers: scorecards.length,
    scorecards,
  })
}
