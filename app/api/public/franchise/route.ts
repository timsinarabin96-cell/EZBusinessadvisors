/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

// ---------------------------------------------------------------------------
// GET /api/public/franchise?listingId=…
// Public-safe franchise details for a live listing page. Only fields a public
// buyer may see (brand, investment range, fees, territories, units, training,
// ideal candidate profile). Item 19 content is NEVER returned here — it is
// gated behind a signed NDA via /api/public/nda/item19.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  // Anti-abuse: public endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 30, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  // Only a live, published listing may expose franchise details.
  const { data: feed } = await db.rpc('get_public_listing_feed', { p_slug: listingId })
  if (!Array.isArray(feed) || feed.length === 0) {
    return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  }

  const { data: details } = await db.from('franchise_details').select(
    'brand_name, industry_category, total_investment_min, total_investment_max, franchise_fee, royalty_fee_pct, territories_available, existing_units, training_support, ideal_candidate_liquid_capital, ideal_candidate_net_worth, item19_document_id',
  ).eq('listing_id', listingId).maybeSingle()

  if (!details) return NextResponse.json({ ok: true, franchise: null })

  const franchise = {
    brand_name: details.brand_name,
    industry_category: details.industry_category,
    total_investment_min: details.total_investment_min,
    total_investment_max: details.total_investment_max,
    franchise_fee: details.franchise_fee,
    royalty_fee_pct: details.royalty_fee_pct,
    territories_available: details.territories_available,
    existing_units: details.existing_units,
    training_support: details.training_support,
    ideal_candidate_liquid_capital: details.ideal_candidate_liquid_capital,
    ideal_candidate_net_worth: details.ideal_candidate_net_worth,
    has_item19: Boolean(details.item19_document_id),
  }
  return NextResponse.json({ ok: true, franchise })
}
