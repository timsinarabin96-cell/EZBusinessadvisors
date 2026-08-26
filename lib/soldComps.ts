// =============================================================================
// Public Sold-Comps — Zillow-for-businesses market data
// -----------------------------------------------------------------------------
// Aggregates anonymized sold listings into industry + location market stats:
// average multiple, typical price, count, and time-to-sell. Public SEO gold
// (every industry × state page is a search entry point) and a lead magnet for
// sellers ("what is my business worth?"). Uses the same public RPC as the
// sold wall — never exposes names or addresses.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { extractState, daysBetween } from '@/lib/soldCompsCore.ts'

export { extractState, daysBetween }

export interface SoldCompStat {
  industry: string
  count: number
  avgMultiple: number | null
  avgSalePrice: number | null
  medianSalePrice: number | null
  avgDaysToSell: number | null
}

export interface SoldCompsReport {
  industries: SoldCompStat[]
  states: { state: string; count: number; avgMultiple: number | null }[]
  totals: {
    deals: number
    avgMultiple: number | null
    avgSalePrice: number | null
    industries: number
  }
  updatedAt: string
}

const fmtPrice = (n: number | null | undefined) => (n == null ? null : Math.round(n))

/**
 * Build the full market report from the public sold-listings RPC.
 * Deterministic, zero-token, no LLM. Aggregates by industry + state.
 */
export async function buildSoldCompsReport(agency: string | null = null): Promise<SoldCompsReport> {
  const { data, error } = await supabase.rpc('get_public_sold_listings', { p_agency: agency })
  if (error || !data) {
    return { industries: [], states: [], totals: { deals: 0, avgMultiple: null, avgSalePrice: null, industries: 0 }, updatedAt: new Date().toISOString() }
  }

  const rows = data as {
    listing_id: string
    industry: string | null
    sub_industry: string | null
    location_general: string | null
    asking_price: number | null
    sde: number | null
    multiple: number | null
    closed_at: string | null
    published_at?: string | null
  }[]

  const byIndustry = new Map<string, { count: number; multiples: number[]; prices: number[]; days: number[] }>()
  const byState = new Map<string, { count: number; multiples: number[] }>()

  for (const r of rows) {
    const ind = r.industry || 'Other'
    const bucket = byIndustry.get(ind) || { count: 0, multiples: [], prices: [], days: [] }
    bucket.count += 1
    if (r.multiple != null) bucket.multiples.push(Number(r.multiple))
    if (r.asking_price != null) bucket.prices.push(Number(r.asking_price))
    const days = daysBetween(r.published_at || r.closed_at, r.closed_at || undefined)
    if (days != null) bucket.days.push(days)
    byIndustry.set(ind, bucket)

    const st = extractState(r.location_general)
    if (st) {
      const sb = byState.get(st) || { count: 0, multiples: [] }
      sb.count += 1
      if (r.multiple != null) sb.multiples.push(Number(r.multiple))
      byState.set(st, sb)
    }
  }

  const median = (arr: number[]) => {
    if (arr.length === 0) return null
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  const avg = (arr: number[]) => (arr.length === 0 ? null : arr.reduce((s, v) => s + v, 0) / arr.length)

  const industries: SoldCompStat[] = [...byIndustry.entries()]
    .map(([industry, b]) => ({
      industry,
      count: b.count,
      avgMultiple: b.multiples.length ? Math.round(avg(b.multiples)! * 100) / 100 : null,
      avgSalePrice: avg(b.prices) != null ? fmtPrice(avg(b.prices)) : null,
      medianSalePrice: median(b.prices) != null ? fmtPrice(median(b.prices)) : null,
      avgDaysToSell: avg(b.days) != null ? Math.round(avg(b.days)!) : null,
    }))
    .sort((a, b) => b.count - a.count)

  const states = [...byState.entries()]
    .map(([state, b]) => ({ state, count: b.count, avgMultiple: b.multiples.length ? Math.round(avg(b.multiples)! * 100) / 100 : null }))
    .sort((a, b) => b.count - a.count)

  const allMultiples = rows.map((r) => r.multiple).filter((m): m is number => m != null)
  const allPrices = rows.map((r) => r.asking_price).filter((p): p is number => p != null)

  return {
    industries,
    states,
    totals: {
      deals: rows.length,
      avgMultiple: allMultiples.length ? Math.round((allMultiples.reduce((s, v) => s + v, 0) / allMultiples.length) * 100) / 100 : null,
      avgSalePrice: allPrices.length ? fmtPrice(allPrices.reduce((s, v) => s + v, 0) / allPrices.length) : null,
      industries: industries.length,
    },
    updatedAt: new Date().toISOString(),
  }
}
