/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { suggestAddBacks, type RecastSuggestionInput } from '@/lib/recastSuggestions'
import { enhanceRecastSuggestions } from '@/lib/recastSuggestAi'

export const runtime = 'nodejs'

/**
 * GET /api/listings/recast-suggest?listingId=...
 * Broker-grade add-back suggestions for the Recast step. Reads the listing's
 * financials from the DB and returns suggested add-backs (label, amount,
 * category, rationale, confidence) the broker can accept into the recast.
 * Deterministic rules — no tokens, instant, always available.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  const { data: listing } = await db
    .from('listings')
    .select('business_name, industry, sub_industry, description, annual_revenue, sde, ebitda, asking_price, employees_full_time, year_established')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const input: RecastSuggestionInput = {
    business_name: listing.business_name,
    industry: listing.industry,
    sub_industry: listing.sub_industry,
    description: listing.description,
    annual_revenue: listing.annual_revenue,
    sde: listing.sde,
    ebitda: listing.ebitda,
    asking_price: listing.asking_price,
    employees_full_time: listing.employees_full_time,
    year_established: listing.year_established,
  }

  const rules = suggestAddBacks(input)
  // DeepSeek pass: sharpens the rule baseline with industry knowledge.
  // Fail-safe — any AI error returns the rule suggestions untouched.
  const suggestions = await enhanceRecastSuggestions(input, rules)
  return NextResponse.json({ ok: true, suggestions, aiEnhanced: suggestions !== rules })
}
