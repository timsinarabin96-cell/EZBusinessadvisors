/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Red-Flag Forensics Core — recast financial anomaly detection (zero imports)
// -----------------------------------------------------------------------------
// Deterministic rule engine that scans a recast financial history for the
// patterns buyers and lenders actually fear: revenue spikes right before
// listing, aggressive add-backs inflating SDE, one-time-item dominance,
// owner-compensation jumps, and margin anomalies. Advisory — every flag is a
// "verify this" signal, not an accusation.
// =============================================================================

export type FlagSeverity = 'high' | 'medium' | 'low'

export interface RedFlag {
  code: string
  severity: FlagSeverity
  title: string
  detail: string
  magnitude?: string
}

export interface RedFlagYear {
  year: number
  label: string
  grossRevenue: number
  netIncome: number
  ownerComp: number
}

export interface RedFlagAddBack {
  id: string
  category: string
  description: string
  amount: number
  recurring: boolean
  year: number
}

export interface RedFlagInput {
  businessName?: string | null
  years: RedFlagYear[]
  addBacks: RedFlagAddBack[]
  avgSDE?: number
  avgEBITDA?: number
}

export interface RedFlagReport {
  businessName: string | null
  flags: RedFlag[]
  score: number            // 0 = clean, 100 = extremely risky
  riskBand: 'clean' | 'low' | 'moderate' | 'high'
  summary: string
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Analyze a recast financial history for red flags. Pure + deterministic. */
export function analyzeRedFlags(input: RedFlagInput): RedFlagReport {
  const flags: RedFlag[] = []
  const years = [...input.years].sort((a, b) => a.year - b.year)

  // --- 1. Revenue spike in the final year (the classic "dress-up" pattern).
  if (years.length >= 2) {
    const last = years[years.length - 1]
    const prior = years.slice(0, -1)
    const priorAvg = prior.reduce((s, y) => s + y.grossRevenue, 0) / prior.length
    if (priorAvg > 0) {
      const jump = (last.grossRevenue - priorAvg) / priorAvg
      if (jump > 0.4) {
        flags.push({
          code: 'revenue_spike', severity: 'high',
          title: 'Revenue spike in final year',
          detail: `Latest-year revenue is ${pct(jump)} above the prior-year average. Buyers will ask whether this is sustainable or dressed up for the sale.`,
          magnitude: `+${Math.round(jump * 100)}%`,
        })
      } else if (jump > 0.25) {
        flags.push({
          code: 'revenue_growth', severity: 'medium',
          title: 'Above-trend revenue growth in final year',
          detail: `Latest-year revenue grew ${pct(jump)} over the prior average — worth a sustainability check.`,
          magnitude: `+${Math.round(jump * 100)}%`,
        })
      }
    }
  }

  // --- 2. Declining revenue trend (deteriorating business).
  if (years.length >= 3) {
    const first = years[0].grossRevenue
    const last = years[years.length - 1].grossRevenue
    if (first > 0 && last < first * 0.85) {
      flags.push({
        code: 'revenue_decline', severity: 'medium',
        title: 'Declining revenue trend',
        detail: `Revenue is down ${pct(1 - last / first)} from the earliest year on file. Ensure the asking price reflects the trend.`,
        magnitude: `-${Math.round((1 - last / first) * 100)}%`,
      })
    }
  }

  // --- 3. Add-back overload: add-backs inflate SDE more than reported profit.
  const totalAddBacks = input.addBacks.reduce((s, a) => s + a.amount, 0)
  const avgRevenue = years.length ? years.reduce((s, y) => s + y.grossRevenue, 0) / years.length : 0
  if (avgRevenue > 0) {
    const addBackPct = totalAddBacks / avgRevenue
    if (addBackPct > 0.35) {
      flags.push({
        code: 'addback_overload', severity: 'high',
        title: 'Add-backs are a large share of revenue',
        detail: `Total add-backs equal ${pct(addBackPct)} of average revenue. Verify every single add-back is legitimate and recurring.`,
        magnitude: pct(addBackPct),
      })
    } else if (addBackPct > 0.2) {
      flags.push({
        code: 'addback_heavy', severity: 'medium',
        title: 'Heavy add-back recast',
        detail: `Add-backs equal ${pct(addBackPct)} of average revenue. Document each one for buyer diligence.`,
        magnitude: pct(addBackPct),
      })
    }
  }

  // --- 4. One-time / non-recurring dominance (SDE built on one-off items).
  const oneTime = input.addBacks.filter((a) => !a.recurring)
  if (oneTime.length > 0 && totalAddBacks > 0) {
    const oneTimePct = oneTime.reduce((s, a) => s + a.amount, 0) / totalAddBacks
    if (oneTimePct > 0.5) {
      flags.push({
        code: 'one_time_dominance', severity: 'high',
        title: 'Most add-backs are one-time items',
        detail: `${pct(oneTimePct)} of add-back value is non-recurring — the recast SDE may not be repeatable.`,
        magnitude: pct(oneTimePct),
      })
    }
  }

  // --- 5. Owner compensation jump in the final year.
  if (years.length >= 2) {
    const last = years[years.length - 1]
    const priorAvg = years.slice(0, -1).reduce((s, y) => s + y.ownerComp, 0) / (years.length - 1)
    if (priorAvg > 0 && last.ownerComp > priorAvg * 1.5) {
      flags.push({
        code: 'owner_comp_jump', severity: 'medium',
        title: 'Owner compensation jumped in the final year',
        detail: `Final-year owner comp is ${Math.round((last.ownerComp / priorAvg) * 100)}% of the prior average — confirm the add-back is real.`,
      })
    }
  }

  // --- 6. Margin anomaly: net margin well above industry norms.
  if (years.length >= 2) {
    const last = years[years.length - 1]
    if (last.grossRevenue > 0) {
      const margin = last.netIncome / last.grossRevenue
      if (margin > 0.45) {
        flags.push({
          code: 'margin_anomaly', severity: 'medium',
          title: 'Very high net margin in final year',
          detail: `Net margin is ${pct(margin)} — unusual for most main-street businesses. Verify against industry benchmarks.`,
          magnitude: pct(margin),
        })
      }
    }
  }

  // --- 7. SDE ratio check (when avg SDE provided).
  if (input.avgSDE != null && avgRevenue > 0) {
    const sdeRatio = input.avgSDE / avgRevenue
    if (sdeRatio > 0.5) {
      flags.push({
        code: 'sde_ratio_high', severity: 'medium',
        title: 'SDE is more than half of revenue',
        detail: `Recast SDE equals ${pct(sdeRatio)} of average revenue — verify add-backs and margins independently.`,
        magnitude: pct(sdeRatio),
      })
    }
  }

  // --- Score + band.
  const weight: Record<FlagSeverity, number> = { high: 40, medium: 20, low: 8 }
  const score = Math.min(100, flags.reduce((s, f) => s + weight[f.severity], 0))
  const riskBand = score >= 60 ? 'high' : score >= 35 ? 'moderate' : score >= 12 ? 'low' : 'clean'

  const summary =
    flags.length === 0
      ? 'No material red flags detected in the recast financials.'
      : `${flags.length} signal${flags.length === 1 ? '' : 's'} to verify before marketing this deal.`

  return { businessName: input.businessName || null, flags, score, riskBand, summary }
}
