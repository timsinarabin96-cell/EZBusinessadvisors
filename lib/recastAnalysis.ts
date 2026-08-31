/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Recast ANALYSIS core — pure, dependency-free math for the broker-grade
// recast narrative (Phase: CIM/BOV/recast send path + quality bar).
// -----------------------------------------------------------------------------
// Adds the multi-year trend analysis and add-back JUSTIFICATION layer that a
// real broker would defend in front of a buyer's advisor:
//   - CAGR + YoY growth on revenue / SDE / EBITDA
//   - Margin trend lines (SDE margin, EBITDA margin) per year
//   - Recurring vs one-time add-back split ("quality of earnings")
//   - Per-category justification text (why each add-back is legitimate)
// No imports — unit-testable directly under Node.
// =============================================================================

export interface TrendYear {
  year: number
  label: string
  revenue: number
  sde: number
  ebitda: number
  totalAddBacks: number
  /** Add-back totals by category id (from the recast detail). */
  addBacksByCategory: Record<string, number>
}

export interface RecastAnalysis {
  cagr: {
    revenue: number | null   // decimal, e.g. 0.052 = +5.2%/yr
    sde: number | null
    ebitda: number | null
  }
  yoy: {
    revenue: (number | null)[]  // year-over-year % change, aligned to years[1..]
    sde: (number | null)[]
  }
  margins: {
    sdeMargin: (number | null)[]   // per year (recast SDE / revenue)
    ebitdaMargin: (number | null)[]
  }
  addBackMix: {
    recurringAmount: number        // recurring add-backs, latest year
    oneTimeAmount: number          // one-time / non-recurring, latest year
    recurringPct: number           // recurring share of total add-backs (0-100)
  }
  qualityNote: string
  trendNote: string
  /** Per-category justification lines for the recast schedule. */
  justifications: { category: string; label: string; justification: string }[]
}

// Add-back category → broker-grade justification (defensible, specific).
const JUSTIFICATION_TEXT: Record<string, string> = {
  owner_salary:
    'Owner compensation above the market rate for a replacement manager is added back because the going-concern value is based on the earnings a non-operating (or replacement-managed) owner would realize. The add-back reflects the excess of reported owner pay over the arms-length cost of a general manager.',
  owner_benefits:
    'Owner benefits (health insurance, retirement contributions, vehicle, life insurance, and other perquisites) are personal to the current owner and do not transfer to a new owner at the same level. They are added back as non-operating owner-specific costs.',
  depreciation:
    'Depreciation is a non-cash expense that does not represent an ongoing cash outflow. It is added back to reflect the cash earnings power of the business; capital expenditures are accounted for separately in the buyer\'s own replacement-cost analysis.',
  amortization:
    'Amortization of intangible assets (goodwill, covenants, acquisition intangibles) is a non-cash, non-operating charge and is added back in full.',
  interest:
    'Interest expense reflects the current owner\'s capital structure (debt service on personal or acquisition financing) and is not a cost a new buyer must assume. It is added back so earnings are measured before the buyer\'s own financing choices.',
  discretionary:
    'Discretionary expenses (entertainment, travel, conventions, club memberships, charitable gifts, and other non-essential costs) are at the discretion of the owner and are not required to operate the business. They are added back as owner-specific, non-essential spending.',
  one_time:
    'One-time, non-recurring items (legal settlements, one-off consulting, relocation, start-up costs, COVID-related expenses, unusual repairs) do not reflect the sustainable earnings of the business and are added back.',
  non_arm_length:
    'Payments to related parties (family members, affiliated entities) above fair market value are non-arm\'s-length and are added back to reflect what an independent operator would pay for the same goods or services.',
  personal:
    'Personal expenses run through the business (personal vehicle, family travel, personal insurance, home expenses) are not operating costs of the business and are added back in full.',
  other:
    'Other owner-specific or non-operating items identified during the recast are added back with supporting detail, consistent with standard business-brokerage normalization practice.',
}

/** Human label for each category (mirrors ADD_BACK_CATEGORIES in lib/recast.ts). */
const CATEGORY_LABELS: Record<string, string> = {
  owner_salary: 'Owner Salary & Wages',
  owner_benefits: 'Owner Benefits (health, retirement, auto)',
  depreciation: 'Depreciation',
  amortization: 'Amortization',
  interest: 'Interest Expense (non-operating)',
  discretionary: 'Discretionary / Non-essential',
  one_time: 'One-time / Non-recurring',
  non_arm_length: 'Non-arm\'s-length Payments',
  personal: 'Personal Expenses',
  other: 'Other',
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.replace(/_/g, ' ')
}

export function justificationFor(category: string): string {
  return JUSTIFICATION_TEXT[category] || JUSTIFICATION_TEXT.other
}

const pct1 = (n: number): number => Math.round(n * 1000) / 10 // one decimal

/** CAGR over a series (decimal). Null when insufficient data or non-positive endpoints. */
function cagr(first: number, last: number, periods: number): number | null {
  if (periods < 1 || first <= 0 || last <= 0) return null
  return Math.pow(last / first, 1 / periods) - 1
}

/**
 * Build the full analysis from per-year recast results (oldest → newest).
 */
export function analyzeRecast(years: TrendYear[]): RecastAnalysis {
  const sorted = years.slice().sort((a, b) => a.year - b.year)
  const n = sorted.length

  const revenue = sorted.map((y) => y.revenue)
  const sde = sorted.map((y) => y.sde)
  const ebitda = sorted.map((y) => y.ebitda)

  // CAGR (oldest → newest, n-1 periods)
  const periods = Math.max(1, n - 1)
  const cagrRevenue = n >= 2 ? cagr(revenue[0], revenue[n - 1], periods) : null
  const cagrSde = n >= 2 ? cagr(sde[0], sde[n - 1], periods) : null
  const cagrEbitda = n >= 2 ? cagr(ebitda[0], ebitda[n - 1], periods) : null

  // YoY changes (index i vs i-1), aligned: yoy[i] is change for sorted[i]
  const yoyRevenue: (number | null)[] = [null]
  const yoySde: (number | null)[] = [null]
  for (let i = 1; i < n; i++) {
    yoyRevenue.push(revenue[i - 1] > 0 ? (revenue[i] - revenue[i - 1]) / revenue[i - 1] : null)
    yoySde.push(sde[i - 1] > 0 ? (sde[i] - sde[i - 1]) / sde[i - 1] : null)
  }

  // Margins per year
  const sdeMargin = revenue.map((r, i) => (r > 0 ? sde[i] / r : null))
  const ebitdaMargin = revenue.map((r, i) => (r > 0 ? ebitda[i] / r : null))

  // Add-back mix on the LATEST year (quality of earnings)
  const latest = sorted[n - 1]
  const recurringCats = new Set(['owner_salary', 'owner_benefits', 'depreciation', 'amortization', 'non_arm_length', 'personal'])
  const recurringAmount = Object.entries(latest.addBacksByCategory)
    .filter(([cat]) => recurringCats.has(cat))
    .reduce((s, [, v]) => s + v, 0)
  const oneTimeAmount = Object.entries(latest.addBacksByCategory)
    .filter(([cat]) => !recurringCats.has(cat))
    .reduce((s, [, v]) => s + v, 0)
  const totalAddBacks = latest.totalAddBacks
  const recurringPct = totalAddBacks > 0 ? Math.round((recurringAmount / totalAddBacks) * 100) : 100

  // Quality-of-earnings note
  let qualityNote: string
  if (totalAddBacks === 0) {
    qualityNote =
      'No add-backs were applied in the most recent period. Reported earnings are treated as normalized, which is conservative: the buyer should verify that all owner-specific costs are genuinely absent from the financials.'
  } else if (recurringPct >= 80) {
    qualityNote = `High-quality earnings profile: ${recurringPct}% of add-backs in the latest year are recurring owner-specific or non-cash items (owner comp, benefits, D&A). These are standard, defensible adjustments — a buyer's lender will typically accept them when the underlying records support them.`
  } else if (recurringPct >= 50) {
    qualityNote = `Mixed earnings profile: ${recurringPct}% of add-backs are recurring owner-specific or non-cash items; the balance is one-time or discretionary. One-time items are itemized and traceable so a buyer or lender can independently confirm each adjustment during diligence.`
  } else {
    qualityNote = `Earnings quality is weighted toward one-time and discretionary add-backs (${100 - recurringPct}% of the latest-year total). These are itemized with justification; a buyer's advisor may discount non-recurring add-backs, so the normalized figures should be tested excluding them.`
  }

  // Trend note
  let trendNote: string
  if (n >= 2) {
    const revPct = cagrRevenue === null ? null : cagrRevenue * 100
    const sdePct = cagrSde === null ? null : cagrSde * 100
    if (revPct !== null && Math.abs(revPct) < 1 && sdePct !== null && Math.abs(sdePct) < 2) {
      trendNote = 'Revenue and normalized earnings were broadly stable across the period, with no material upward or downward drift — a profile typical of an established, steady-state small business.'
    } else if (revPct !== null && revPct >= 1 && sdePct !== null && sdePct >= 1) {
      trendNote = `Earnings trended upward over the period: revenue grew at a ${revPct.toFixed(1)}% compound annual rate and normalized SDE at ${sdePct.toFixed(1)}% per year, reflecting genuine operating momentum rather than accounting adjustments.`
    } else if (revPct !== null && revPct <= -1) {
      trendNote = `Revenue declined at a ${Math.abs(revPct).toFixed(1)}% compound annual rate over the period. The recast isolates the normalized earnings of the current operating base; a buyer should underwrite current-year run-rate rather than peak historical results.`
    } else {
      trendNote = `Revenue grew at a ${(revPct || 0).toFixed(1)}% compound annual rate while normalized SDE moved ${(sdePct || 0) >= 0 ? 'up' : 'down'} ${Math.abs(sdePct || 0).toFixed(1)}% per year — consistent with margin dynamics that the buyer should model explicitly in their own underwriting.`
    }
  } else {
    trendNote = 'Single-period recast: normalized earnings are presented for the most recent period only. Multi-year trend analysis requires additional historical financials.'
  }

  // Per-category justifications (only categories present across the period)
  const presentCats = new Set<string>()
  for (const y of sorted) {
    for (const cat of Object.keys(y.addBacksByCategory)) presentCats.add(cat)
  }
  const justifications = [...presentCats]
    .sort()
    .map((cat) => ({ category: cat, label: categoryLabel(cat), justification: justificationFor(cat) }))

  return {
    cagr: { revenue: cagrRevenue, sde: cagrSde, ebitda: cagrEbitda },
    yoy: { revenue: yoyRevenue, sde: yoySde },
    margins: { sdeMargin, ebitdaMargin },
    addBackMix: { recurringAmount, oneTimeAmount, recurringPct },
    qualityNote,
    trendNote,
    justifications,
  }
}

/** Format a decimal rate as a signed percent string for narrative use. */
export const ratePct = (r: number | null): string => {
  if (r === null || r === undefined || isNaN(r)) return '—'
  const v = r * 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}
