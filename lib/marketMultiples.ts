/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// marketMultiples — client-safe wrapper around the market-multiples core.
// The valuation engine, BOV/CIM generators and dashboards import this; tests
// hit marketMultiplesCore.ts directly.
// =============================================================================

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


