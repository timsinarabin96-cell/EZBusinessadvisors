/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// sellerPortal — client wrapper for the seller self-service portal.
// Sellers open their private link (/seller/<token>) to see valuation progress,
// live listing views, buyer interest, and next steps. Token is the auth —
// same pattern as the lender portal; no login needed.
// =============================================================================

export interface SellerPortalData {
  ok: boolean
  error?: string
  lead: {
    id: string
    business_name: string | null
    industry: string | null
    location_general: string | null
    status: string | null
    source: string | null
    created_at: string | null
  } | null
  listing: {
    id: string
    listing_ref: string | null
    business_name: string | null
    industry: string | null
    location_general: string | null
    asking_price: number | null
    status: string | null
    published: boolean
  } | null
  stats: {
    views7d: number
    viewsTotal: number
    ndaRequests: number
  }
  nextSteps: string[]
}

export async function fetchSellerPortal(token: string): Promise<SellerPortalData> {
  const empty: SellerPortalData = {
    ok: false,
    lead: null,
    listing: null,
    stats: { views7d: 0, viewsTotal: 0, ndaRequests: 0 },
    nextSteps: [],
  }
  try {
    const res = await fetch(`/api/seller-portal?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    return res.json().catch(() => empty)
  } catch {
    return empty
  }
}

/** Human label for a seller lead status. */
export const leadStatusLabel = (s: string | null | undefined): string => {
  const map: Record<string, string> = {
    new: 'In review',
    contacted: 'Contacted',
    qualifying: 'Qualifying',
    qualified: 'Qualified',
    closed: 'Closed',
    handed_off: 'Handed off',
  }
  return map[s || ''] || s || 'In review'
}
