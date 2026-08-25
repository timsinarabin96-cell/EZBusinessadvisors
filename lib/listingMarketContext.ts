// =============================================================================
// listingMarketContext — server-side assembly of buyer-facing market context
// for a public listing: industry band from the market-multiples reference,
// sold-comps callouts, and the "why this listing" story. Used by the public
// listing detail page (server component).
// =============================================================================

import { bandForIndustry } from '@/lib/marketMultiplesCore.ts'
import { buildSoldCompsReport } from '@/lib/soldComps'
import { buildMarketContext, pricePosition, type MarketBand, type MarketContext } from '@/lib/listingMarketContextCore.ts'

export { buildMarketContext, pricePosition }
export type { MarketBand, MarketContext } from '@/lib/listingMarketContextCore.ts'

export interface PublicListingContextInput {
  industry: string | null
  asking_price: number | null
  sde: number | null
  ebitda: number | null
  location_general?: string | null
  established_year?: number | null
}

/**
 * Build the market context for a public listing. Falls back gracefully when
 * the band or comps are unavailable — the teaser always renders something.
 */
export async function fetchListingMarketContext(input: PublicListingContextInput): Promise<MarketContext> {
  const band: MarketBand | null = bandForIndustry(input.industry, input.ebitda ? 'EBITDA' : 'SDE')

  // Sold-comps for the industry (best-effort; null when none exist yet).
  let comp: MarketContext['comp'] = null
  try {
    const report = await buildSoldCompsReport()
    const match = report.industries.find((i) => {
      const a = (i.industry || '').toLowerCase()
      const b = (input.industry || '').toLowerCase()
      return a === b || a.includes(b) || b.includes(a)
    })
    if (match && match.count > 0) {
      comp = {
        count: match.count,
        avgMultiple: match.avgMultiple,
        medianSalePrice: match.medianSalePrice,
        avgDaysToSell: match.avgDaysToSell,
      }
    }
  } catch {
    comp = null
  }

  return buildMarketContext(input, band, comp)
}
