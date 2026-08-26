/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// staleListingCore — pure, dependency-free stale-listing intelligence.
// Combines listing age, buyer views, NDA inquiries, and the industry's
// market-multiple band to answer: is this listing going stale, and is the
// PRICE the problem? Produces a 0-100 attention score, human-readable flags,
// and a market-anchored price suggestion. Advisory — never auto-changes price.
// Unit-testable without a database.
// =============================================================================

export interface StaleListingInput {
  listingId: string
  listingRef?: string | null
  businessName?: string | null
  industry?: string | null
  askingPrice: number | null
  sde: number | null
  ebitda: number | null
  /** Days since the listing was published (0 = not yet published). */
  ageDays: number
  views7d: number
  viewsTotal: number
  ndaRequests: number
  /** Market band from the market-multiples reference. */
  band: { industry: string; basis: 'SDE' | 'EBITDA'; min: number; max: number } | null
}

export interface StaleFlag {
  code: string
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
}

export interface StaleListingResult {
  listingId: string
  listingRef: string | null
  businessName: string | null
  ageDays: number
  views7d: number
  viewsTotal: number
  ndaRequests: number
  /** 0-100 — higher means it needs attention now. */
  score: number
  status: 'healthy' | 'cooling' | 'stale' | 'unpublished'
  flags: StaleFlag[]
  /** Market-anchored price suggestion (null when price isn't the issue). */
  suggestedPrice: number | null
  suggestedMultiple: number | null
  headline: string
}

const round = (n: number): number => Math.round(n)

/** Assess one listing. Pure and deterministic. */
export function assessStaleListing(input: StaleListingInput): StaleListingResult {
  const flags: StaleFlag[] = []
  const { ageDays, viewsTotal, views7d, ndaRequests, askingPrice, sde, ebitda, band } = input

  // --- Age -----------------------------------------------------------------
  let score = 0
  let status: StaleListingResult['status'] = ageDays === 0 ? 'unpublished' : ageDays < 30 ? 'healthy' : ageDays <= 60 ? 'cooling' : 'stale'
  if (ageDays > 60) {
    score += 35
    flags.push({ code: 'stale_age', severity: 'high', title: 'Listing is stale', detail: `Published ${ageDays} days ago — most small-business listings get serious interest in the first 60 days.` })
  } else if (ageDays > 30) {
    score += 15
    flags.push({ code: 'cooling_age', severity: 'medium', title: 'Interest window closing', detail: `Published ${ageDays} days ago — momentum matters in this market.` })
  }

  // --- Views without inquiries ----------------------------------------------
  if (viewsTotal >= 10 && ndaRequests === 0) {
    score += 30
    flags.push({
      code: 'views_no_inquiries', severity: 'high',
      title: 'Views but zero buyer inquiries',
      detail: `${viewsTotal} buyers viewed this listing, but nobody requested confidential access — the page is getting traffic, the deal is not converting.`,
    })
  } else if (viewsTotal >= 5 && ndaRequests === 0) {
    score += 12
    flags.push({ code: 'views_low_inquiries', severity: 'low', title: 'Low inquiry rate', detail: `${viewsTotal} views, ${ndaRequests} access requests — below the typical conversion pattern.` })
  }

  // --- Price vs market band ---------------------------------------------------
  let suggestedPrice: number | null = null
  let suggestedMultiple: number | null = null
  if (band && askingPrice != null) {
    const earnings = band.basis === 'EBITDA' ? ebitda ?? sde : sde ?? ebitda
    const multiple = earnings && earnings > 0 ? askingPrice / earnings : null
    if (multiple != null && multiple > band.max) {
      score += 25
      const anchor = round(band.max * earnings)
      suggestedPrice = anchor
      suggestedMultiple = band.max
      flags.push({
        code: 'above_market_band', severity: 'medium',
        title: 'Priced above the market band',
        detail: `Asking price is ${multiple.toFixed(1)}× ${band.basis} — above the typical ${band.min.toFixed(1)}–${band.max.toFixed(1)}× range for ${band.industry}. Market-anchored suggestion: ${anchor >= 1000 ? '$' + anchor.toLocaleString() : '$' + anchor} (${band.max.toFixed(1)}×).`,
      })
    } else if (multiple != null && multiple > band.max - 0.3 && multiple <= band.max) {
      score += 8
      flags.push({ code: 'near_band_ceiling', severity: 'low', title: 'Priced near the top of the band', detail: `${multiple.toFixed(1)}× ${band.basis} is at the upper edge of the ${band.industry} range — buyers may negotiate hard.` })
    }
  }

  // --- Cap + headline ----------------------------------------------------------
  score = Math.min(100, score)
  const headline =
    status === 'unpublished'
      ? 'Not published yet'
      : flags.length === 0
        ? 'Healthy — keep the momentum'
        : flags.map((f) => f.title).join(' · ')

  return {
    listingId: input.listingId,
    listingRef: input.listingRef ?? null,
    businessName: input.businessName ?? null,
    ageDays,
    views7d,
    viewsTotal,
    ndaRequests,
    score,
    status,
    flags,
    suggestedPrice,
    suggestedMultiple,
    headline,
  }
}
