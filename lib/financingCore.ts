/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Financing Core — loan-readiness engine (pure, zero imports)
// -----------------------------------------------------------------------------
// Scores how "loan-ready" a listing's financials are for SBA 7(a) financing
// and generates the broker-grade loan package checklist buyers actually need:
// PFS, 2-year projections, collateral schedule, SBA eligibility, DSCR.
// Pure + deterministic — unit-tested under Node.
// =============================================================================

export interface FinancingInput {
  askingPrice: number
  sde?: number | null
  ebitda?: number | null
  annualRevenue?: number | null
  yearsOfFinancials?: number
  sellerFinancingAvailable?: boolean
  realEstateIncluded?: boolean
  collateralAvailable?: boolean   // equipment/RE/AR that can secure the loan
  businessAgeYears?: number
}

export interface LoanPackageItem {
  key: string
  label: string
  required: boolean
  ready: boolean
  note: string
}

export interface FinancingAssessment {
  score: number            // 0–100 loan-readiness
  band: 'excellent' | 'good' | 'fair' | 'weak'
  dscr: number | null      // debt service coverage ratio
  maxLoanAmount: number | null
  requiredDownPayment: number | null
  estMonthlyPayment: number | null
  packageItems: LoanPackageItem[]
  blockers: string[]
}

const SBA_RATE = 0.10      // ~10% blended SBA 7(a) rate assumption
const SBA_TERM_YEARS = 10  // typical term for acquisition financing

/** Compute a listing's loan-readiness. Pure — deterministic and testable. */
export function assessLoanReadiness(input: FinancingInput): FinancingAssessment {
  const price = Math.max(0, input.askingPrice || 0)
  const sde = input.sde ?? input.ebitda ?? null
  const blockers: string[] = []
  const packageItems: LoanPackageItem[] = []

  // --- Debt service coverage (DSCR = SDE / annual payment).
  let dscr: number | null = null
  let maxLoanAmount: number | null = null
  let estMonthlyPayment: number | null = null
  if (price > 0) {
    // Standard SBA 7(a): 10% down, 90% financed.
    const financed = price * 0.9
    const monthlyRate = SBA_RATE / 12
    const months = SBA_TERM_YEARS * 12
    estMonthlyPayment = Math.round((financed * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)))
    if (sde != null && sde > 0) {
      dscr = Math.round((sde / (estMonthlyPayment * 12)) * 100) / 100
    }
    // Conservative max loan: annual SDE covers 1.25× debt service.
    if (dscr != null && dscr >= 1.25) {
      maxLoanAmount = Math.round(price * 0.9)
    } else if (sde != null && sde > 0) {
      maxLoanAmount = Math.round((sde / 1.25 / SBA_RATE) / 1000) * 1000
    }
  }

  // --- Package checklist.
  const years = input.yearsOfFinancials ?? 0
  const items: [string, string, boolean, boolean, string][] = [
    ['pfs', 'Personal Financial Statement', true, true, 'Required by every SBA lender.'],
    ['projections', '2-year revenue & profit projections', true, years >= 2, years >= 2 ? 'Supported by financial history.' : 'Need 2+ years of financials to build credible projections.'],
    ['collateral', 'Collateral schedule (equipment, RE, AR)', true, !!input.collateralAvailable, input.collateralAvailable ? 'Collateral identified.' : 'Identify equipment/real-estate/AR to secure the loan.'],
    ['sba_eligibility', 'SBA eligibility check', true, (input.businessAgeYears ?? 0) >= 2, (input.businessAgeYears ?? 0) >= 2 ? 'Business age meets SBA 2-year rule.' : 'SBA generally requires 2+ years operating history.'],
    ['financials', '3 years tax returns + P&L', true, years >= 2, years >= 2 ? 'Financial history on file.' : 'Gather tax returns and P&Ls.'],
    ['dscr', 'Debt service coverage ≥ 1.25', true, dscr != null && dscr >= 1.25, dscr != null ? `DSCR is ${dscr.toFixed(2)}.` : 'SDE missing — cannot compute coverage.'],
    ['down_payment', '10% down payment sourced', true, input.collateralAvailable !== false && price > 0, 'Buyer needs ~10% down + closing costs.'],
    ['seller_financing', 'Seller financing considered', false, !!input.sellerFinancingAvailable, 'Seller carry can bridge valuation gaps.'],
  ]
  for (const [key, label, required, ready, note] of items) {
    packageItems.push({ key, label, required, ready, note })
  }

  const requiredItems = packageItems.filter((i) => i.required)
  const readyCount = requiredItems.filter((i) => i.ready).length
  const score = requiredItems.length ? Math.round((readyCount / requiredItems.length) * 100) : 0
  const band = score >= 85 ? 'excellent' : score >= 65 ? 'good' : score >= 40 ? 'fair' : 'weak'

  if (!sde) blockers.push('No SDE/EBITDA on file — add recast financials first.')
  if (dscr != null && dscr < 1.25) blockers.push(`DSCR ${dscr.toFixed(2)} is below the 1.25 lender threshold — price may be too high for current earnings.`)
  if ((input.businessAgeYears ?? 0) < 2) blockers.push('Business operating history under 2 years — SBA eligibility risk.')
  if (!input.collateralAvailable) blockers.push('No collateral identified yet.')

  return {
    score,
    band,
    dscr,
    maxLoanAmount,
    requiredDownPayment: price > 0 ? Math.round(price * 0.1) : null,
    estMonthlyPayment,
    packageItems,
    blockers,
  }
}

export const FINANCING_BAND_LABELS: Record<string, string> = {
  excellent: 'Loan-ready',
  good: 'Strong candidate',
  fair: 'Needs work',
  weak: 'Not loan-ready yet',
}

export const FINANCING_BAND_COLORS: Record<string, string> = {
  excellent: '#1e7e34',
  good: '#0e7490',
  fair: '#b45309',
  weak: '#b00020',
}
