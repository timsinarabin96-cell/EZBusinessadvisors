/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// =============================================================================
// Bank-vs-Books verification — the red-flag goldmine.
// -----------------------------------------------------------------------------
// Compares what the BANK actually shows (deposits / cash inflows from bank
// statement extractions) against the BOOKS (reported revenue on the listing).
// Produces a verdict + variance report:
//   - 'verified'   → bank deposits ≈ reported revenue (within tolerance)
//   - 'review'     → material gap; revenue_verified badge NOT granted
//   - 'no_bank_docs' → nothing to compare yet
// The result is stored on verified_financials and drives the public
// revenue_verified badge — the trust layer buyers pay attention to.
// =============================================================================

export interface BankBooksVerdict {
  status: 'verified' | 'review' | 'no_bank_docs'
  reportedRevenue: number | null
  bankDeposits: number | null
  variancePct: number | null
  tolerancePct: number
  detail: {
    bankDocs: number
    totalDeposits: number
    depositYears: number[]
    notes: string[]
  }
  verifiedAt: string
}

const DEFAULT_TOLERANCE_PCT = 20

/**
 * Compute the bank-vs-books verdict from extractions (pure — no IO).
 * `bankExtractions` = approved/overridden financial_extractions rows whose
 * doc_type suggests a bank statement (or any doc with balances/deposits).
 */
export function computeBankBooksVerdict(input: {
  reportedRevenue: number | null
  bankRows: Array<{ fiscal_year: number | null; extracted: Record<string, unknown> | null; broker_override: Record<string, unknown> | null; review_state: string }>
  tolerancePct?: number
}): BankBooksVerdict {
  const tolerancePct = input.tolerancePct ?? DEFAULT_TOLERANCE_PCT
  const verifiedAt = new Date().toISOString()
  const notes: string[] = []

  // Aggregate deposits from bank statement extractions (override wins).
  let totalDeposits = 0
  const depositYears = new Set<number>()
  let bankDocs = 0
  for (const row of input.bankRows) {
    const d = row.review_state === 'overridden' && row.broker_override ? row.broker_override : row.extracted || {}
    const deposits = Number(d.depositsTotal ?? d.depositTotal ?? d.cashInflow ?? d.revenueTotal ?? 0)
    if (deposits > 0) {
      totalDeposits += deposits
      if (row.fiscal_year) depositYears.add(row.fiscal_year)
      bankDocs++
    }
  }

  const reportedRevenue = input.reportedRevenue != null && input.reportedRevenue > 0 ? input.reportedRevenue : null

  if (bankDocs === 0 || totalDeposits <= 0) {
    return {
      status: 'no_bank_docs',
      reportedRevenue,
      bankDeposits: null,
      variancePct: null,
      tolerancePct,
      detail: { bankDocs: 0, totalDeposits: 0, depositYears: [], notes: ['No bank statement deposits found to compare against reported revenue.'] },
      verifiedAt,
    }
  }

  if (reportedRevenue == null) {
    return {
      status: 'review',
      reportedRevenue: null,
      bankDeposits: totalDeposits,
      variancePct: null,
      tolerancePct,
      detail: { bankDocs, totalDeposits, depositYears: Array.from(depositYears), notes: ['Bank deposits found, but the listing has no reported revenue to compare.'] },
      verifiedAt,
    }
  }

  const variancePct = Math.round(((totalDeposits - reportedRevenue) / reportedRevenue) * 100)
  const withinTolerance = Math.abs(variancePct) <= tolerancePct

  notes.push(
    withinTolerance
      ? `Bank deposits (${Math.round(totalDeposits).toLocaleString()}) are within ${tolerancePct}% of reported revenue (${Math.round(reportedRevenue).toLocaleString()}).`
      : `⚠️ Bank deposits (${Math.round(totalDeposits).toLocaleString()}) differ from reported revenue (${Math.round(reportedRevenue).toLocaleString()}) by ${variancePct}% — over the ${tolerancePct}% tolerance.`,
  )

  return {
    status: withinTolerance ? 'verified' : 'review',
    reportedRevenue,
    bankDeposits: totalDeposits,
    variancePct,
    tolerancePct,
    detail: { bankDocs, totalDeposits, depositYears: Array.from(depositYears), notes },
    verifiedAt,
  }
}

/**
 * Run the full bank-vs-books check server-side for a listing:
 * loads approved/overridden extractions, computes the verdict, persists it to
 * verified_financials, and syncs the public revenue_verified badge.
 */
export async function runBankBooksVerification(listingId: string, agencyId: string): Promise<{ ok: boolean; verdict?: BankBooksVerdict; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }

  // 1) Listing reported revenue.
  const { data: listing } = await svc.from('listings').select('id, annual_revenue').eq('id', listingId).maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found' }
  const reportedRevenue = Number((listing as { annual_revenue?: number | null }).annual_revenue) || null

  // 2) Approved/overridden extractions (bank-ish docs prioritized).
  const { data: extractions } = await svc
    .from('financial_extractions')
    .select('fiscal_year, extracted, broker_override, review_state, doc_type')
    .eq('listing_id', listingId)
    .in('review_state', ['approved', 'overridden'])
  const allRows = (extractions || []) as Array<{
    fiscal_year: number | null
    extracted: Record<string, unknown> | null
    broker_override: Record<string, unknown> | null
    review_state: string
    doc_type: string
  }>
  const bankRows = allRows.filter((r) => /bank|statement|deposit/i.test(String(r.doc_type || '')) || (r.extracted && (Number(r.extracted.depositsTotal) || Number(r.extracted.cashInflow))) )

  const verdict = computeBankBooksVerdict({ reportedRevenue, bankRows })

  // 3) Persist to verified_financials.
  try {
    await svc.from('verified_financials').upsert({
      listing_id: listingId,
      agency_id: agencyId,
      status: verdict.status === 'verified' ? 'verified' : 'failed',
      verified_revenue: verdict.bankDeposits,
      verified_revenue_basis: 'bank_deposits',
      verification_detail: verdict as unknown as Record<string, unknown>,
      verified_at: verdict.verifiedAt,
    }, { onConflict: 'listing_id' }).select().maybeSingle()
  } catch { /* best-effort */ }

  // 4) Sync the public badge.
  try {
    await svc
      .from('public_listings')
      .update({ revenue_verified: verdict.status === 'verified' })
      .eq('listing_id', listingId)
  } catch { /* best-effort */ }

  return { ok: true, verdict }
}
