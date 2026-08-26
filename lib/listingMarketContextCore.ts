/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// listingMarketContextCore — pure, dependency-free buyer-facing market context.
// Turns a public listing's numbers into a buyer-facing story:
//   - the typical sale multiple band for its industry,
//   - where the asking price sits relative to that band (below/within/above),
//   - comparable-deal callouts,
//   - a "why this listing" teaser line.
// Unit-testable without a database. Mirrors the market_multiples reference.
// =============================================================================

export interface MarketContextInput {
  industry: string | null
  asking_price: number | null
  sde: number | null
  ebitda: number | null
  location_general?: string | null
  established_year?: number | null
}

export interface MarketBand {
  industry: string
  basis: 'SDE' | 'EBITDA'
  min: number
  max: number
  sourceNote?: string
}

export interface PricePosition {
  multiple: number | null // asking price ÷ earnings on the band's basis
  basis: 'SDE' | 'EBITDA'
  bandMin: number
  bandMax: number
  position: 'below' | 'within' | 'above' | 'unknown'
}

export interface IndustryCompStat {
  count: number
  avgMultiple: number | null
  medianSalePrice: number | null
  avgDaysToSell: number | null
}

export interface MarketContext {
  band: MarketBand | null
  position: PricePosition | null
  comp: IndustryCompStat | null
  teaser: string
  bullets: string[]
}

const money = (n: number | null | undefined): string =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString()

/** Where does the asking price sit relative to the industry's typical band? */
export function pricePosition(
  asking: number | null | undefined,
  sde: number | null | undefined,
  ebitda: number | null | undefined,
  band: MarketBand | null
): PricePosition | null {
  if (asking == null || !band) return null
  const earnings = band.basis === 'EBITDA' ? ebitda ?? sde : sde ?? ebitda
  if (!earnings || earnings <= 0) {
    return { multiple: null, basis: band.basis, bandMin: band.min, bandMax: band.max, position: 'unknown' }
  }
  const multiple = asking / earnings
  const position: PricePosition['position'] =
    multiple < band.min ? 'below' : multiple > band.max ? 'above' : 'within'
  return { multiple, basis: band.basis, bandMin: band.min, bandMax: band.max, position }
}

/**
 * Build the buyer-facing market context for a public listing.
 * `band` comes from the market-multiples reference; `comp` from sold-comps
 * (may be null when no comparable deals exist yet).
 */
export function buildMarketContext(
  input: MarketContextInput,
  band: MarketBand | null,
  comp: IndustryCompStat | null
): MarketContext {
  const pos = pricePosition(input.asking_price, input.sde, input.ebitda, band)

  const bullets: string[] = []
  if (band) {
    bullets.push(
      `${band.industry} businesses typically sell at ${band.min.toFixed(1)}–${band.max.toFixed(1)}× ${band.basis} in the current market`,
    )
  }
  if (pos && pos.multiple != null) {
    const verdict =
      pos.position === 'within'
        ? `This asking price of ${pos.multiple.toFixed(1)}× ${pos.basis} sits within the typical range`
        : pos.position === 'below'
          ? `This asking price of ${pos.multiple.toFixed(1)}× ${pos.basis} is below the typical range — a value-oriented entry point`
          : `This asking price of ${pos.multiple.toFixed(1)}× ${pos.basis} is above the typical range, reflecting quality, growth, or scarcity`
    bullets.push(verdict)
  }
  if (comp && comp.count > 0) {
    const parts = [`${comp.count} comparable deal${comp.count === 1 ? '' : 's'} tracked`]
    if (comp.medianSalePrice != null) parts.push(`median ${money(comp.medianSalePrice)}`)
    if (comp.avgDaysToSell != null) parts.push(`~${comp.avgDaysToSell} days to sell`)
    bullets.push(parts.join(' · '))
  }
  if (input.established_year) {
    bullets.push(`Established ${input.established_year}${input.location_general ? ` · ${input.location_general}` : ''}`)
  } else if (input.location_general) {
    bullets.push(`Located in ${input.location_general}`)
  }

  const teaser = (() => {
    if (!input.industry) return 'A confidential business acquisition opportunity.'
    const base = `${input.industry} business`
    if (pos && pos.multiple != null && band) {
      return `${base} offered at ${pos.multiple.toFixed(1)}× ${pos.basis} — ${pos.position === 'within' ? 'in line with' : pos.position === 'below' ? 'below' : 'premium to'} the typical ${band.min.toFixed(1)}–${band.max.toFixed(1)}× market range.`
    }
    if (band) return `${base} — ${band.industry} typically sells at ${band.min.toFixed(1)}–${band.max.toFixed(1)}× ${band.basis}.`
    return `${base} offered for sale.`
  })()

  return { band, position: pos, comp, teaser, bullets }
}
