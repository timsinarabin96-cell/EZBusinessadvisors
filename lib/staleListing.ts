/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// staleListing — client wrapper for stale-listing intelligence.
// Fetches the agency's listings + their live stats (views 7d/total, NDA
// requests, market band) and scores each with the pure core.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { bandForIndustry } from '@/lib/marketMultiplesCore.ts'
import { assessStaleListing, type StaleListingInput, type StaleListingResult } from '@/lib/staleListingCore.ts'

export { assessStaleListing }
export type { StaleListingInput, StaleListingResult, StaleFlag } from '@/lib/staleListingCore.ts'

const daysSince = (iso: string | null | undefined): number => {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  if (!t) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

/**
 * Assess all of the agency's active/published listings for staleness.
 * Returns results sorted by attention score (highest first). Never throws.
 */
export async function fetchStaleListingIntelligence(): Promise<StaleListingResult[]> {
  try {
    const [listingsRes, viewsRes, ndaRes] = await Promise.all([
      supabase.from('listings').select('id, listing_ref, business_name, industry, asking_price, sde, ebitda, published_at, status'),
      supabase.from('listing_views').select('listing_id, viewed_at'),
      supabase.from('data_room_access_requests').select('listing_id, status'),
    ])

    const listings = (listingsRes.data || []) as Record<string, unknown>[]
    const views = (viewsRes.data || []) as { listing_id: string; viewed_at?: string }[]
    const ndas = (ndaRes.data || []) as { listing_id: string; status?: string }[]

    // Aggregate views + NDA requests per listing.
    const viewsByListing = new Map<string, { total: number; week: number }>()
    const since = new Date(Date.now() - 7 * 86400000).toISOString()
    for (const v of views) {
      const b = viewsByListing.get(v.listing_id) || { total: 0, week: 0 }
      b.total += 1
      if (v.viewed_at && v.viewed_at >= since) b.week += 1
      viewsByListing.set(v.listing_id, b)
    }
    const ndaByListing = new Map<string, number>()
    for (const n of ndas) {
      ndaByListing.set(n.listing_id, (ndaByListing.get(n.listing_id) || 0) + 1)
    }

    const out: StaleListingResult[] = []
    for (const l of listings) {
      const id = String(l.id)
      const askingPrice = l.asking_price != null ? Number(l.asking_price) : null
      const sde = l.sde != null ? Number(l.sde) : null
      const ebitda = l.ebitda != null ? Number(l.ebitda) : null
      const industry = (l.industry as string) || null
      const band = bandForIndustry(industry, ebitda ? 'EBITDA' : 'SDE')

      out.push(assessStaleListing({
        listingId: id,
        listingRef: (l.listing_ref as string) || null,
        businessName: (l.business_name as string) || null,
        industry,
        askingPrice,
        sde,
        ebitda,
        ageDays: daysSince(l.published_at as string | null),
        views7d: viewsByListing.get(id)?.week || 0,
        viewsTotal: viewsByListing.get(id)?.total || 0,
        ndaRequests: ndaByListing.get(id) || 0,
        band: band ? { industry: band.industry, basis: band.basis, min: band.min, max: band.max } : null,
      }))
    }

    return out.sort((a, b) => b.score - a.score)
  } catch {
    return []
  }
}
