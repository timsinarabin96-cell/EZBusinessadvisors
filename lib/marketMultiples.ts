// =============================================================================
// marketMultiples — client-safe wrapper around the market-multiples core.
// The valuation engine, BOV/CIM generators and dashboards import this; tests
// hit marketMultiplesCore.ts directly.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import {
  MARKET_MULTIPLES,
  matchIndustry,
  bandsForIndustry,
  bandForIndustry,
} from '@/lib/marketMultiplesCore.ts'

export { MARKET_MULTIPLES, matchIndustry, bandsForIndustry, bandForIndustry }
export type { MarketBand } from '@/lib/marketMultiplesCore.ts'

export interface MarketMultiplesRow {
  id: string
  industry: string
  aliases: string[]
  basis: 'SDE' | 'EBITDA'
  min_multiple: number
  max_multiple: number
  source_note: string | null
  updated_at?: string | null
}

/**
 * Fetch live bands from the market_multiples table (so admin edits apply),
 * falling back to the bundled static data when the table is unreachable.
 */
export async function fetchMarketBands(): Promise<MarketMultiplesRow[]> {
  try {
    const { data, error } = await supabase.from('market_multiples').select('*')
    if (!error && data && data.length > 0) return data as MarketMultiplesRow[]
  } catch {
    // fall through to static
  }
  return MARKET_MULTIPLES.map((b) => ({
    id: '',
    industry: b.industry,
    aliases: [],
    basis: b.basis,
    min_multiple: b.min,
    max_multiple: b.max,
    source_note: b.sourceNote || null,
  }))
}

/** Human label: "Home care — 4.0–5.0× EBITDA". */
export function formatBand(
  b: { industry: string; basis: string; min: number; max: number } | null | undefined
): string {
  if (!b) return '—'
  return `${b.industry} — ${b.min.toFixed(1)}–${b.max.toFixed(1)}× ${b.basis}`
}
