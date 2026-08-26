/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimitAsync, clientIp } from '@/lib/rateLimit'
import { matchIndustry } from '@/lib/marketMultiplesCore'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/marketplace/buyer-demand?industry=…&location=…
// "X qualified buyers are waiting for businesses like yours" — the Flippa
// demand-signal play. Counts ACTIVE buyer search profiles that match the
// seller's industry and/or location. Public + rate-limited (count only —
// never exposes buyer identity).
// =============================================================================

export async function GET(req: NextRequest) {
  // Public surface — 30 calls/min per IP is plenty for a count badge.
  if (!(await rateLimitAsync(clientIp(req), { limit: 30, windowMs: 60_000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const industry = String(req.nextUrl.searchParams.get('industry') || '').trim()
  const location = String(req.nextUrl.searchParams.get('location') || '').trim()

  const { data, error } = await db
    .from('buyer_search_profiles')
    .select('industries, locations, active')
    .eq('active', true)
    .limit(500)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const profiles = (data || []) as Array<{ industries: string[] | null; locations: string[] | null }>
  const canonical = matchIndustry(industry)

  let industryMatch = 0
  let locationMatch = 0
  let total = 0
  for (const p of profiles) {
    total++
    const inds = Array.isArray(p.industries) ? p.industries : []
    const locs = Array.isArray(p.locations) ? p.locations : []
    if (industry && inds.some((i) => {
      if (canonical && matchIndustry(i) === canonical) return true
      return i.toLowerCase().includes(industry.toLowerCase()) || industry.toLowerCase().includes(i.toLowerCase())
    })) industryMatch++
    if (location && locs.some((l) => l.toLowerCase().includes(location.toLowerCase()) || location.toLowerCase().includes(l.toLowerCase()))) locationMatch++
  }

  // Match = industry AND/OR location. Prefer industry-specific counts so the
  // badge is honest: "14 buyers match your industry" beats a fake total.
  const matched = industry && location ? Math.max(industryMatch, locationMatch) : industry ? industryMatch : locationMatch
  const shown = matched > 0 ? matched : total

  return NextResponse.json({
    ok: true,
    industry,
    location,
    industryMatch,
    locationMatch,
    totalProfiles: total,
    matched,
    shown,
  })
}
