/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Listing Quality Score — broker-side "how attractive is this listing?"
// -----------------------------------------------------------------------------
// Deterministic 0-100 score across the elements buyers actually respond to:
// photos, headline, summary, financials, highlights, documents, NDA gate,
// SBA/financing, and compliance readiness. Tells the broker exactly what to
// add to attract more buyers. Zero tokens, instant.
// =============================================================================

import type { PublicMarketplaceListing } from '@/lib/marketplace'

export interface QualityCheck {
  label: string
  met: boolean
  weight: number
  hint: string
}

export interface QualityResult {
  score: number
  checks: QualityCheck[]
  missing: string[]
}

/** Score a public-facing listing's presentation quality. */
export function scoreListingQuality(listing: Partial<PublicMarketplaceListing> & { id: string }): QualityResult {
  const checks: QualityCheck[] = [
    { label: 'Photo', met: !!listing.gallery_urls?.length, weight: 20, hint: 'Add at least one photo — listings with photos get far more views.' },
    { label: 'Headline / title', met: !!(listing.public_title && listing.public_title.length > 8), weight: 10, hint: 'Write a clear, specific title (e.g. "Profitable Laundromat — Queens, NY").' },
    { label: 'Summary', met: !!(listing.public_summary && listing.public_summary.length > 40), weight: 10, hint: 'Write a 2-3 sentence summary that sells the opportunity.' },
    { label: 'Highlights', met: !!(listing.public_highlights?.length && listing.public_highlights.length >= 3), weight: 15, hint: 'Add 3+ highlights (revenue, margins, absentee-friendly, growth).' },
    { label: 'Asking price', met: listing.asking_price != null, weight: 15, hint: 'Set an asking price — "Upon Request" reduces inquiries.' },
    { label: 'Financials visible or NDA-gated', met: listing.show_financials === true || listing.is_confidential === true, weight: 10, hint: 'Show financials or gate them behind the NDA for qualified buyers.' },
    { label: 'Financing / SBA ready', met: listing.seller_financing_available === true, weight: 10, hint: 'Mention seller financing or SBA eligibility — buyers filter on it.' },
    { label: 'Location', met: !!listing.location_general, weight: 5, hint: 'Add a general location (city/state).' },
    { label: 'Absentee / franchise flags', met: listing.is_absentee_owner === true || listing.is_franchise === true, weight: 5, hint: 'Flag absentee-friendly or franchise opportunities.' },
  ]

  let points = 0
  const missing: string[] = []
  for (const check of checks) {
    if (check.met) points += check.weight
    else missing.push(check.hint)
  }

  return { score: Math.max(0, Math.min(100, points)), checks, missing }
}

/** Band label for the quality score. */
export function qualityBand(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'Ready to attract buyers', color: '#15803d' }
  if (score >= 65) return { label: 'Good — a few quick wins', color: '#0e7490' }
  if (score >= 40) return { label: 'Needs work', color: '#b45309' }
  return { label: 'Will struggle for views', color: '#b91c1c' }
}
