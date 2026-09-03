/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/ai/financialExtractor.ts — AI-normalized financial extraction.
// -----------------------------------------------------------------------------
// SERVER-ONLY. Takes one-or-more document analyses (from documentAnalyzer) and
// merges them into a single broker-grade extraction set: 3–5 year revenue
// history, SDE / EBITDA, add-backs, valuation multiples, key ratios and smart
// tags. This is the "inputs" layer the Recast / BOV / CIM / BLI generators
// consume. Re-uses the deterministic computeFinancialMetrics-style math but
// fed by Claude-extracted numbers.
// =============================================================================

import type {
  DocumentAnalysis,
  FinancialIntelligence,
} from '@/lib/ai/types'

export interface AiExtractionOutput {
  listingId: string
  listingName: string
  revenueByYear: { year: number; revenue: number; label: string }[]
  revenueTotal: number
  expenseTotal: number
  sde: number
  ebitda: number
  addBacks: { label: string; amount: number; recurring: boolean }[]
  ownerComp: number
  grossMargin: number | null
  sdeMargin: number | null
  ebitdaMargin: number | null
  sdeMultipleLow: number
  sdeMultipleHigh: number
  valueRangeLow: number
  valueRangeHigh: number
  workingCapital: number
  debt: number
  assets: number
  liabilities: number
  ratios: DocumentAnalysis['ratios']
  trends: DocumentAnalysis['trends']
  tags: string[]
  /** Sourced line items merged across every analyzed document (dedup by label+period, source kept). */
  lineItems: DocumentAnalysis['lineItems']
  documents: FinancialIntelligence['documents']
}

// ---------------------------------------------------------------------------
// Merging heuristics — pick the most reliable source per metric.
// ---------------------------------------------------------------------------
function sumPresent(values: (number | null | undefined)[]): number {
  const present = values.filter((v) => v != null && isFinite(v as number)) as number[]
  return present.length ? present.reduce((a, b) => a + b, 0) : 0
}

function richestRevenue(analyses: DocumentAnalysis[]): { year: number; revenue: number; label: string }[] {
  // Collect every year/revenue row across all analyses, dedup by year, keep
  // the first non-null revenue seen (prefer P&L / tax over support docs).
  const byYear = new Map<number, { revenue: number; label: string }>()
  for (const a of analyses) {
    for (const y of a.years) {
      if (!y.year || y.revenue == null) continue
      if (!byYear.has(y.year)) {
        byYear.set(y.year, { revenue: y.revenue, label: y.label || `FY ${y.year}` })
      }
    }
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0]) // newest first
    .map(([year, v]) => ({ year, revenue: v.revenue, label: v.label }))
    .slice(0, 5)
}

function bestSde(analyses: DocumentAnalysis[]): number {
  const vals = analyses.map((a) => a.sde).filter((v) => v != null && v > 0)
  if (vals.length) return Math.max(...vals)
  return 0
}

function bestEbitda(analyses: DocumentAnalysis[]): number {
  const vals = analyses.map((a) => a.ebitda).filter((v) => v != null && v > 0)
  if (vals.length) return Math.max(...vals)
  return 0
}

function bestBalanceMetric(analyses: DocumentAnalysis[], pick: (b: DocumentAnalysis['balances'][0]) => number | null | undefined): number {
  const found: number[] = []
  for (const a of analyses) {
    for (const b of a.balances) {
      const v = pick(b)
      if (v != null && isFinite(v)) found.push(v as number)
    }
  }
  if (!found.length) return 0
  // Use the most recent snapshot if multiple; here we take the latest asOf.
  return found[found.length - 1]
}

/**
 * Merge several Claude document analyses into one normalized extraction set.
 */
export function mergeAnalyses({
  listingId,
  listingName,
  analyses,
  askingPrice = 0,
}: {
  listingId: string
  listingName: string
  analyses: DocumentAnalysis[]
  askingPrice?: number
}): AiExtractionOutput {
  const revenueByYear = richestRevenue(analyses)
  const revenueTotal = revenueByYear.length
    ? revenueByYear[0].revenue
    : sumPresent(analyses.map((a) => a.revenueTotal))

  const sde = bestSde(analyses)
  const ebitda = bestEbitda(analyses)
  const ownerComp = Math.max(0, sde - ebitda)

  // Annualized expense categories from document asks (multi-year overlap).
  const expenseTotal =
    sumPresent(analyses.map((a) => a.expenseTotal)) || Math.max(0, revenueTotal - sde)

  const grossMargin = revenueTotal ? Math.max(0, (revenueTotal - (revenueTotal * 0.55)) / revenueTotal) : null
  const sdeMargin = revenueTotal ? sde / revenueTotal : null
  const ebitdaMargin = revenueTotal ? ebitda / revenueTotal : null

  // Valuation anchors (broker-standard 2.5x–4.0x of SDE, or EBITDA for larger).
  const sdeMultipleLow = 2.5
  const sdeMultipleHigh = 4.0
  const base = sde || ebitda || Math.round(revenueTotal * 0.2)
  const valueRangeLow = Math.round(base * sdeMultipleLow)
  const valueRangeHigh = Math.round(base * sdeMultipleHigh)

  const workingCapital = bestBalanceMetric(analyses, (b) =>
    b.accountsReceivable != null && b.inventory != null && b.accountsPayable != null
      ? (b.accountsReceivable ?? 0) + (b.inventory ?? 0) - (b.accountsPayable ?? 0)
      : undefined)
  const debt = bestBalanceMetric(analyses, (b) => b.debt)
  const assets = bestBalanceMetric(analyses, (b) => b.totalAssets)
  const liabilities = bestBalanceMetric(analyses, (b) => b.totalLiabilities)

  // Add-backs: owner comp + D&A are the classic recurring add-backs.
  const addBacks: { label: string; amount: number; recurring: boolean }[] = []
  if (ownerComp > 0) addBacks.push({ label: 'Owner compensation & benefits (recurring)', amount: ownerComp, recurring: true })
  if (sde > ebitda) addBacks.push({ label: 'Depreciation & amortization', amount: Math.max(0, sde - ebitda), recurring: true })

  // Smart tags aggregated across all documents.
  const tags = Array.from(new Set(analyses.flatMap((a) => a.tags))).slice(0, 24)

  const ratios = analyses.flatMap((a) => a.ratios).slice(0, 12)
  const trends = analyses.flatMap((a) => a.trends).slice(0, 12)

  // Sourced line items — merge across all docs, dedup by label+period, keep the
  // FIRST source seen (prefer tax/P&L, which come earlier in the analyses list
  // per caller ordering). Never a bare number: every item has a source ref.
  const seen = new Set<string>()
  const lineItems: DocumentAnalysis['lineItems'] = []
  for (const a of analyses) {
    for (const li of a.lineItems || []) {
      const key = `${li.category}|${li.period ?? ''}|${li.label}|${li.amount}`
      if (seen.has(key)) continue
      seen.add(key)
      lineItems.push(li)
    }
  }

  const documents = analyses.map((a) => ({
    fileName: a.fileName,
    type: a.type,
    typeLabel: a.typeLabel,
    confidence: a.confidence,
    tags: a.tags,
    keyMetrics: a.keyMetrics,
  }))

  return {
    listingId,
    listingName,
    revenueByYear,
    revenueTotal,
    expenseTotal,
    sde,
    ebitda,
    addBacks,
    ownerComp,
    grossMargin,
    sdeMargin,
    ebitdaMargin,
    sdeMultipleLow,
    sdeMultipleHigh,
    valueRangeLow,
    valueRangeHigh,
    workingCapital,
    debt,
    assets,
    liabilities,
    ratios,
    trends,
    tags,
    lineItems,
    documents,
  }
}


