/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Normalized earnings — THE single source of truth for SDE / EBITDA / revenue
// across every client-facing document (CIM, BOV, recast PDF, BLI).
// -----------------------------------------------------------------------------
// Audit fix (08-31): the CIM cover, BOV, and recast each computed earnings
// independently (listing.sde vs a fabricated BOV history vs real recast years),
// so documents contradicted each other — e.g. cover $318k vs recast $572k, and
// YoY 3.6% (fabricated) vs 9.0% (real). Everything now resolves through ONE
// function: when a recast exists its multi-year figures ARE the truth; the
// listing fields are only a fallback for listings with no recast yet.
// Pure — no imports, unit-testable under Node.
// =============================================================================

export interface CanonicalYear {
  year: number
  label: string
  revenue: number
  sde: number
  ebitda: number
  totalAddBacks: number
  addBacksByCategory: Record<string, number>
}

export interface NormalizedEarnings {
  /** Latest-period canonical figures (recast latest year, else listing). */
  revenue: number
  sde: number
  ebitda: number
  /** Multi-year series (recast years when available, else derived single). */
  years: CanonicalYear[]
  /** True when the numbers come from an actual recast (multi-year + analysis). */
  hasRecast: boolean
  /** Trend analysis when a recast is present. */
  analysis: {
    cagrRevenue: number | null
    cagrSde: number | null
    yoyRevenue: (number | null)[]
    sdeMargin: (number | null)[]
    recurringPct: number
    qualityNote: string
    trendNote: string
  } | null
}

export interface ListingEarningsInput {
  annual_revenue?: number | null
  sde?: number | null
  ebitda?: number | null
}

export interface RecastYearsInput {
  years: {
    year: number
    label?: string
    recast: { revenue: number; sde: number; ebitda: number }
    totalAddBacks: number
    addBackDetail: { category: string; amount: number }[]
  }[]
  analysis?: {
    cagr?: { revenue: number | null; sde: number | null }
    yoy?: { revenue: (number | null)[] }
    margins?: { sdeMargin: (number | null)[] }
    addBackMix?: { recurringPct: number }
    qualityNote?: string
    trendNote?: string
  } | null
}

/**
 * Resolve the canonical normalized earnings for a listing.
 * Precedence: recast years (real multi-year data) → listing fields (single
 * derived year, clearly marked as not-yet-recast).
 */
export function resolveNormalizedEarnings(
  listing: ListingEarningsInput,
  recast?: RecastYearsInput | null,
): NormalizedEarnings {
  if (recast && Array.isArray(recast.years) && recast.years.length > 0) {
    const sorted = recast.years.slice().sort((a, b) => a.year - b.year)
    const latest = sorted[sorted.length - 1]
    const years: CanonicalYear[] = sorted.map((yr) => ({
      year: yr.year,
      label: yr.label || String(yr.year),
      revenue: yr.recast.revenue,
      sde: yr.recast.sde,
      ebitda: yr.recast.ebitda,
      totalAddBacks: yr.totalAddBacks || 0,
      addBacksByCategory: Object.fromEntries((yr.addBackDetail || []).map((d) => [d.category, d.amount])),
    }))
    return {
      revenue: latest.recast.revenue,
      sde: latest.recast.sde,
      ebitda: latest.recast.ebitda,
      years,
      hasRecast: true,
      analysis: {
        cagrRevenue: recast.analysis?.cagr?.revenue ?? null,
        cagrSde: recast.analysis?.cagr?.sde ?? null,
        yoyRevenue: recast.analysis?.yoy?.revenue ?? years.map(() => null),
        sdeMargin: recast.analysis?.margins?.sdeMargin ?? years.map((y) => (y.revenue > 0 ? y.sde / y.revenue : null)),
        recurringPct: recast.analysis?.addBackMix?.recurringPct ?? 100,
        qualityNote: recast.analysis?.qualityNote || '',
        trendNote: recast.analysis?.trendNote || '',
      },
    }
  }

  // Fallback: listing fields. Single derived year, honestly labeled.
  const revenue = listing.annual_revenue || 0
  const sde = listing.sde || 0
  const ebitda = listing.ebitda || sde * 0.82
  const year = new Date().getFullYear()
  const years: CanonicalYear[] = [
    {
      year,
      label: `FY${year}`,
      revenue,
      sde,
      ebitda,
      totalAddBacks: 0,
      addBacksByCategory: {},
    },
  ]
  return {
    revenue,
    sde,
    ebitda,
    years,
    hasRecast: false,
    analysis: null,
  }
}

/** YoY revenue growth for the latest year vs the prior year (decimal, null if n/a). */
export function latestYoYRevenue(e: NormalizedEarnings): number | null {
  if (e.years.length < 2) return null
  const sorted = e.years.slice().sort((a, b) => a.year - b.year)
  const last = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]
  if (prev.revenue <= 0) return null
  return (last.revenue - prev.revenue) / prev.revenue
}

/** SDE margin for the latest period (decimal, null if n/a). */
export function latestSdeMargin(e: NormalizedEarnings): number | null {
  if (e.revenue <= 0) return null
  return e.sde / e.revenue
}
