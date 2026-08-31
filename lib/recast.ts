/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Financial Recasting Engine — core data model & recast logic
// -----------------------------------------------------------------------------
// Recasts raw owner financials (P&L / tax returns) into sustainable, broker-
// grade SDE / EBITDA figures by applying standard business-brokerage add-backs:
//   Owner salary & benefits, depreciation, interest (non-operating), one-time
//   and discretionary expenses, non-arm's-length payments, etc.
// Supports: multiple entity types, 3+ years of history, before/after compare.
// =============================================================================

export type RecastEntityType = 's_corp' | 'c_corp' | 'llc' | 'partnership' | 'sole_prop'

import { supabase } from '@/lib/supabase/client'
import { analyzeRecast, type TrendYear } from './recastAnalysis.ts'

export const ENTITY_TYPES: { id: RecastEntityType; label: string }[] = [
  { id: 's_corp', label: 'S-Corp' },
  { id: 'c_corp', label: 'C-Corp' },
  { id: 'llc', label: 'LLC' },
  { id: 'partnership', label: 'Partnership' },
  { id: 'sole_prop', label: 'Sole Proprietor' },
]

// Standard add-back categories used in broker recast work
export type AddBackCategory =
  | 'owner_salary'
  | 'owner_benefits'
  | 'depreciation'
  | 'amortization'
  | 'interest'
  | 'discretionary'
  | 'one_time'
  | 'non_arm_length'
  | 'personal'
  | 'other'

export const ADD_BACK_CATEGORIES: { id: AddBackCategory; label: string; defaultChecked: boolean }[] = [
  { id: 'owner_salary', label: 'Owner Salary & Wages', defaultChecked: true },
  { id: 'owner_benefits', label: 'Owner Benefits (health, retirement, auto)', defaultChecked: true },
  { id: 'depreciation', label: 'Depreciation', defaultChecked: true },
  { id: 'amortization', label: 'Amortization', defaultChecked: true },
  { id: 'interest', label: 'Interest Expense (non-operating)', defaultChecked: false },
  { id: 'discretionary', label: 'Discretionary / Non-essential', defaultChecked: true },
  { id: 'one_time', label: 'One-time / Non-recurring', defaultChecked: true },
  { id: 'non_arm_length', label: 'Non-arm\'s-length Payments', defaultChecked: true },
  { id: 'personal', label: 'Personal Expenses', defaultChecked: true },
  { id: 'other', label: 'Other (leisure, travel, charitable)', defaultChecked: true },
]

export interface YearFinancials {
  year: number              // e.g. 2023
  label: string             // e.g. "FY2023" or "2023"
  grossRevenue: number
  // expense lines before recast (as-reported)
  cogs: number
  operatingExpenses: number
  ownerComp: number         // reported owner compensation/benefits (added back)
  depreciation: number      // D&A (added back)
  interest: number          // interest expense (added back)
  otherExpenses: number
  netIncome: number         // as-reported bottom line (optional, derived)
}

export interface AddBack {
  id: string
  category: AddBackCategory
  description: string
  amount: number
  recurring: boolean        // recurring add-backs are the "true" sustainable ones
  year: number              // which fiscal year this add-back applies to
}

export interface RecastDoc {
  id: string
  fileName: string
  mimeType: string
  size: number
  kind: 'tax_return' | 'p_l' | 'balance_sheet' | 'csv' | 'excel' | 'other'
  extracted: boolean
  extractedAt?: string
}

export interface RecastInput {
  listingId: string | null
  businessName: string
  entityType: RecastEntityType
  currency: string
  years: YearFinancials[]
  addBacks: AddBack[]
}

export interface RecastYearResult {
  year: number
  label: string
  asReported: {
    revenue: number
    netIncome: number
  }
  addBackDetail: {
    category: AddBackCategory
    label: string
    amount: number
  }[]
  totalAddBacks: number
  /** Categories present in the source financials but NOT in the itemized
   *  schedule — surfaced so the broker can add them as labeled lines instead
   *  of the engine folding them in silently (boss 08-31, req #2). */
  missingCategories: { category: AddBackCategory; label: string; amount: number }[]
  recast: {
    revenue: number
    sde: number        // seller's discretionary earnings
    ebitda: number     // earnings before interest, tax, D&A
  }
}

export interface RecastResult {
  businessName: string
  entityType: RecastEntityType
  currency: string
  years: RecastYearResult[]
  // Broker-grade summary metrics
  avgSDE: number
  avgEBITDA: number
  trendNote: string
  // Used for the "Before vs After" visual
  /** Multi-year trend + add-back justification analysis (Phase: send path). */
  analysis?: import('./recastAnalysis.ts').RecastAnalysis
}

// Helper formatters
export const fmt$ = (n: number | null | undefined, currency = '$'): string => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  const sign = n < 0 ? '-' : ''
  return `${currency}${sign}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', INR: '₹',
  AED: 'AED ', SGD: 'S$', JPY: '¥', CNY: '¥', CHF: 'CHF ', MXN: 'MX$',
  BRL: 'R$', ZAR: 'R', NGN: '₦', KES: 'KSh ', PKR: '₨', BDT: '৳',
  PHP: '₱', THB: '฿', VND: '₫', MYR: 'RM', IDR: 'Rp ', HKD: 'HK$',
  KRW: '₩', NZD: 'NZ$', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł',
}

/** ISO 4217 code → display symbol (falls back to code + space). */
export const currencySymbol = (code: string | null | undefined): string =>
  CURRENCY_SYMBOLS[(code || 'USD').toUpperCase()] || ((code || 'USD').toUpperCase() + ' ')

/** Format an amount in a given ISO currency. */
export const fmtMoney = (n: number | null | undefined, currencyCode: string | null | undefined): string =>
  fmt$(n, currencySymbol(currencyCode))

export const fmt$K = (n: number | null | undefined, currency = '$'): string => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return fmt$(Math.round(n / 100) * 100, currency)
}

// ---------------------------------------------------------------------------
// Recast algorithm
// ---------------------------------------------------------------------------
export function recastFinancials(input: RecastInput): RecastResult {
  const { years, addBacks } = input
  const currency = input.currency || '$'

  const yearResults: RecastYearResult[] = years.map((yr) => {
    // As-reported net income (we derive when not provided)
    const asReportedNet =
      yr.netIncome ||
      yr.grossRevenue - (yr.cogs + yr.operatingExpenses + yr.ownerComp + yr.depreciation + yr.interest + yr.otherExpenses)

    // Add-backs that apply to this fiscal year — the itemized schedule is the
    // COMPLETE list of add-backs. Nothing else may enter the SDE formula.
    const yrAddBacks = addBacks.filter((a) => a.year === yr.year)

    // Aggregate by category
    const byCat = new Map<AddBackCategory, number>()
    for (const ab of yrAddBacks) {
      byCat.set(ab.category, (byCat.get(ab.category) || 0) + ab.amount)
    }
    const detail = ADD_BACK_CATEGORIES
      .filter((c) => (byCat.get(c.id) || 0) !== 0)
      .map((c) => ({ category: c.id, label: c.label, amount: byCat.get(c.id) || 0 }))

    const totalAddBacks = yrAddBacks.reduce((s, a) => s + a.amount, 0)

    // AUDIT FIX (boss 08-31): Recast SDE is COMPUTED bottom-up from the
    // itemized schedule only — NEVER from YearFinancials ownerComp/depreciation
    // fields added on top of it (that double-counted them: FY2026 gap was
    // exactly 142k ownerComp + 24k depreciation = 166k).
    // Recast SDE = Net Income + Σ(itemized add-back lines). No other inputs.
    const sde = asReportedNet + totalAddBacks

    // EBITDA is derived from the SAME itemized schedule so no hidden inputs
    // exist in any document: NI + interest lines + D&A lines + non-owner
    // one-time lines. (If a caller wants interest added back, it must appear as
    // its own labeled interest line — never folded silently into the total.)
    const sumCat = (cats: AddBackCategory[]): number =>
      yrAddBacks.filter((a) => cats.includes(a.category)).reduce((s, a) => s + a.amount, 0)
    const interestLines = sumCat(['interest'])
    const daLines = sumCat(['depreciation', 'amortization'])
    const nonOwnerOneTime = sumCat(['one_time', 'discretionary', 'personal', 'non_arm_length', 'other'])
    const ebitda = asReportedNet + interestLines + daLines + nonOwnerOneTime

    // Categories present in the source financials but absent from the itemized
    // schedule (interest, depreciation, owner comp). The engine NEVER folds
    // these in — they are surfaced so the broker can add a labeled line.
    const itemizedCats = new Set(yrAddBacks.map((a) => a.category))
    const missingCategories: { category: AddBackCategory; label: string; amount: number }[] = []
    if (yr.interest && !itemizedCats.has('interest')) {
      missingCategories.push({ category: 'interest', label: 'Interest Expense (non-operating)', amount: yr.interest })
    }
    if (yr.depreciation && !itemizedCats.has('depreciation') && !itemizedCats.has('amortization')) {
      missingCategories.push({ category: 'depreciation', label: 'Depreciation & Amortization', amount: yr.depreciation })
    }
    if (yr.ownerComp && !itemizedCats.has('owner_salary') && !itemizedCats.has('owner_benefits')) {
      missingCategories.push({ category: 'owner_salary', label: 'Owner Compensation (reported)', amount: yr.ownerComp })
    }

    return {
      year: yr.year,
      label: yr.label || String(yr.year),
      asReported: { revenue: yr.grossRevenue, netIncome: asReportedNet },
      addBackDetail: detail,
      totalAddBacks,
      missingCategories,
      recast: { revenue: yr.grossRevenue, sde, ebitda },
    }
  })

  // Averages across available years
  const validSDE = yearResults.filter((y) => !isNaN(y.recast.sde))
  const validEBITDA = yearResults.filter((y) => !isNaN(y.recast.ebitda))
  const avgSDE = validSDE.length ? Math.round(validSDE.reduce((s, y) => s + y.recast.sde, 0) / validSDE.length) : 0
  const avgEBITDA = validEBITDA.length ? Math.round(validEBITDA.reduce((s, y) => s + y.recast.ebitda, 0) / validEBITDA.length) : 0

  // Simple trend note
  let trendNote = 'Stable earnings trend across the period.'
  if (yearResults.length >= 2) {
    const first = yearResults[0].recast.sde
    const last = yearResults[yearResults.length - 1].recast.sde
    if (last > first) trendNote = `Earnings trending upward (+${fmt$(last - first, currency)}) over the period.`
    else if (last < first) trendNote = `Earnings trending downward (${fmt$(last - first, currency)}) over the period.`
  }

  // Build the result, then HARD-VALIDATE before anything can consume it.
  // The invariant (boss 08-31): Recast SDE MUST equal Net Income + Σ(itemized
  // add-back lines) for EVERY period. If it ever drifts, generation is
  // rejected here — before any document (recast/BOV/CIM) can be produced.
  const result: RecastResult = { businessName: input.businessName, entityType: input.entityType, currency, years: yearResults, avgSDE, avgEBITDA, trendNote }
  const errors = recastConsistencyErrors(result)
  if (errors.length > 0) {
    throw new Error(`Recast consistency check failed — refusing to generate:\n${errors.join('\n')}`)
  }
  return result
}

// ---------------------------------------------------------------------------
// Recast consistency invariant (boss 08-31, structural guarantee).
// EVERY recast that leaves this engine satisfies:
//   Recast SDE = Net Income + Σ(itemized add-back lines)   for every period
// and Recast EBITDA is derived from the SAME itemized schedule. No document
// may calculate its own earnings — they all read this validated result.
// ---------------------------------------------------------------------------
export function recastConsistencyErrors(result: RecastResult): string[] {
  const errors: string[] = []
  for (const yr of result.years) {
    const expected = yr.asReported.netIncome + yr.totalAddBacks
    const delta = Math.abs(expected - yr.recast.sde)
    if (delta > 0.01) {
      errors.push(
        `${yr.label}: Net Income ${yr.asReported.netIncome.toLocaleString()} + itemized add-backs ${yr.totalAddBacks.toLocaleString()} = ${expected.toLocaleString()}, but Recast SDE = ${yr.recast.sde.toLocaleString()} (gap ${(yr.recast.sde - expected).toLocaleString()})`,
      )
    }
    // EBITDA must also be reproducible from the schedule: NI + interest lines
    // + D&A lines + non-owner one-time lines.
    const schedEbitda = yr.asReported.netIncome +
      yr.addBackDetail.filter((d) => d.category === 'interest').reduce((s, d) => s + d.amount, 0) +
      yr.addBackDetail.filter((d) => d.category === 'depreciation' || d.category === 'amortization').reduce((s, d) => s + d.amount, 0) +
      yr.addBackDetail.filter((d) => ['one_time', 'discretionary', 'personal', 'non_arm_length', 'other'].includes(d.category)).reduce((s, d) => s + d.amount, 0)
    const ebitdaDelta = Math.abs(schedEbitda - yr.recast.ebitda)
    if (ebitdaDelta > 0.01) {
      errors.push(`${yr.label}: EBITDA is not reproducible from the itemized schedule (gap ${ebitdaDelta.toLocaleString()})`)
    }
  }
  return errors
}

/** Throw when the invariant fails — used by docDelivery before PDF generation. */
export function assertRecastConsistency(result: RecastResult): void {
  const errors = recastConsistencyErrors(result)
  if (errors.length > 0) {
    throw new Error(`Recast consistency check failed:\n${errors.join('\n')}`)
  }
}

// ---------------------------------------------------------------------------
// Attach the multi-year trend + add-back justification analysis (Phase: send
// path + quality bar). Pure — call after recastFinancials to enrich the result
// with CAGR/YoY/margins, quality-of-earnings mix, and per-category
// justifications that a broker can defend in front of a buyer's advisor.
// ---------------------------------------------------------------------------
export function attachRecastAnalysis(result: RecastResult): RecastResult {
  const years: TrendYear[] = result.years
    .slice()
    .sort((a, b) => a.year - b.year)
    .map((yr) => ({
      year: yr.year,
      label: yr.label || String(yr.year),
      revenue: yr.recast.revenue,
      sde: yr.recast.sde,
      ebitda: yr.recast.ebitda,
      totalAddBacks: yr.totalAddBacks,
      addBacksByCategory: Object.fromEntries(yr.addBackDetail.map((d) => [d.category, d.amount])),
    }))
  const analysis = analyzeRecast(years)
  return { ...result, trendNote: analysis.trendNote, analysis }
}

// ---------------------------------------------------------------------------
// CSV / simple parser for quick data import (auto-extract from CSVs)
// Expects header rows containing common labels. This is a lightweight heuristic
// parser — a full OCR/ML pipeline can be dropped in later.
// ---------------------------------------------------------------------------
export interface ExtractedRow {
  year: number
  revenue?: number
  cogs?: number
  operatingExpenses?: number
  ownerComp?: number
  depreciation?: number
  interest?: number
  otherExpenses?: number
}

const num = (v: string): number | undefined => {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? undefined : n
}

const lookup = (row: Record<string, string>, keywords: string[]): number | undefined => {
  for (const k of Object.keys(row)) {
    const kLower = k.toLowerCase()
    if (keywords.some((w) => kLower.includes(w))) {
      const n = num(row[k])
      if (n !== undefined) return n
    }
  }
  return undefined
}

export function parseFinancialCsv(csvText: string, lastYear: number): ExtractedRow[] {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase())
  const rows: ExtractedRow[] = []

  lines.slice(1).forEach((line) => {
    if (!line.trim()) return
    const cells = line.split(/[,;\t]/)
    const record: Record<string, string> = {}
    header.forEach((h, i) => { record[h] = (cells[i] || '').trim() })

    const year = lookup(record, ['year', 'fy', 'period']) || lastYear
    rows.push({
      year,
      revenue: lookup(record, ['revenue', 'gross', 'gross revenue', 'sales', 'receipts']),
      cogs: lookup(record, ['cogs', 'cost of goods', 'cost of sales']),
      operatingExpenses: lookup(record, ['operating', 'o&a', 'expenses', 'overhead']),
      ownerComp: lookup(record, ['owner', 'officer comp', 'salary', 'wages', 'payroll']),
      depreciation: lookup(record, ['depreciation', 'deprec', 'amortization', 'd&a']),
      interest: lookup(record, ['interest']),
      otherExpenses: lookup(record, ['other', 'misc']),
    })
  })

  return rows
}

// ---------------------------------------------------------------------------
// Recast project persistence (recast_projects table — sql/phase2_schema.sql)
// Stores the raw input (years + add-backs) plus the computed result, so a
// broker can save, reopen and version their normalized-learnings analyses.
// ---------------------------------------------------------------------------

export interface RecastProject {
  id: string
  listing_id: string | null
  business_name: string
  entity_type: RecastEntityType
  currency: string
  years_json: RecastInput['years'] | YearFinancials[]
  addbacks_json: AddBack[]
  result_json: RecastResult | null
  status: 'draft' | 'finalized'
  created_by: string | null
  created_at?: string | null
  updated_at?: string | null
}

export async function fetchRecastProjects(): Promise<RecastProject[]> {
  const { data, error } = await supabase
    .from('recast_projects')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('fetchRecastProjects error:', error)
    throw new Error(error.message || 'Failed to load recast projects')
  }
  return (data as RecastProject[]) || []
}

export async function fetchRecastProject(id: string): Promise<RecastProject | null> {
  const { data, error } = await supabase.from('recast_projects').select('*').eq('id', id).single()
  if (error) {
    console.error('fetchRecastProject error:', error)
    return null
  }
  return (data as RecastProject) || null
}

export async function saveRecastProject(input: {
  listing_id?: string | null
  business_name: string
  entity_type: RecastEntityType
  currency: string
  yearFinancials: YearFinancials[]
  addBacks: AddBack[]
  result: RecastResult | null
  status?: 'draft' | 'finalized'
}): Promise<RecastProject> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('recast_projects')
    .insert({
      listing_id: input.listing_id ?? null,
      business_name: input.business_name,
      entity_type: input.entity_type,
      currency: input.currency,
      years_json: input.yearFinancials,
      addbacks_json: input.addBacks,
      result_json: input.result,
      status: input.status ?? 'draft',
      created_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) {
    console.error('saveRecastProject error:', error)
    throw new Error(error.message || 'Failed to save recast project')
  }
  return data as RecastProject
}
