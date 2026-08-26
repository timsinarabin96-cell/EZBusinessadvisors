/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Instant Underwriting Core — buyer pre-qualification engine (zero imports)
// -----------------------------------------------------------------------------
// Pure, deterministic qualification: given a buyer's target price, liquid
// capital, income, credit tier, and SBA pre-approval, return a qualification
// level (Funded / Pre-approved / Qualified / Exploring), a 0–100 score, and
// concrete next actions. Rules mirror common SBA 7(a) underwriting heuristics
// (10% down, debt-service coverage, credit minimums) — advisory only.
// =============================================================================

export type CreditTier = 'excellent' | 'good' | 'fair' | 'poor'
export type QualificationLevel = 'funded' | 'pre_approved' | 'qualified' | 'exploring'

export interface UnderwritingInput {
  targetPrice: number
  liquidCapital: number
  annualIncome: number
  creditTier: CreditTier
  sbaPreApproved?: boolean
  hasBusinessExperience?: boolean
}

export interface UnderwritingResult {
  level: QualificationLevel
  levelLabel: string
  score: number           // 0–100
  badges: string[]
  actions: string[]
  reasons: string[]
}

export const LEVEL_LABELS: Record<QualificationLevel, string> = {
  funded: 'Funded ✅',
  pre_approved: 'Pre-approved',
  qualified: 'Qualified',
  exploring: 'Exploring',
}

const CREDIT_POINTS: Record<CreditTier, number> = { excellent: 100, good: 80, fair: 55, poor: 30 }

/**
 * Qualify a buyer. Pure function — deterministic and testable.
 * SBA-style heuristics:
 *  - Down payment: ~10% of price + ~5% closing → target ~15% liquid.
 *  - Debt-service coverage: income should cover ~20% of price annually.
 *  - Credit: good/excellent required for SBA financing.
 */
export function qualifyBuyer(input: UnderwritingInput): UnderwritingResult {
  const price = Math.max(0, input.targetPrice || 0)
  const liquid = Math.max(0, input.liquidCapital || 0)
  const income = Math.max(0, input.annualIncome || 0)
  const reasons: string[] = []
  const actions: string[] = []
  const badges: string[] = []

  const liquidPct = price > 0 ? (liquid / price) * 100 : 0
  const incomePct = price > 0 ? (income / price) * 100 : 0
  const credit = CREDIT_POINTS[input.creditTier] ?? 50

  // Score build-up (0–100).
  let score = 0
  score += Math.min(30, Math.round(liquidPct * 1.5))          // liquidity
  score += Math.min(25, Math.round(incomePct * 1.1))          // income coverage
  score += Math.round(credit / 4)                              // credit (up to 25)
  if (input.sbaPreApproved) { score += 15; badges.push('SBA pre-approval on file') }
  if (input.hasBusinessExperience) { score += 5; badges.push('Prior business ownership') }
  score = Math.max(0, Math.min(100, score))

  // Qualification level.
  let level: QualificationLevel = 'exploring'
  const liquidOk = liquidPct >= 15
  const incomeOk = incomePct >= 20
  const creditOk = input.creditTier === 'excellent' || input.creditTier === 'good'

  if (price === 0) {
    reasons.push('No target price provided — ask for their budget range first.')
    actions.push('Pick a target price range to see qualification.')
  } else if (liquidOk && incomeOk && creditOk) {
    level = 'funded'
    reasons.push(`Liquid capital covers ${Math.round(liquidPct)}% of price (15%+ target).`)
    reasons.push(`Income covers ${Math.round(incomePct)}% of price annually (20%+ target).`)
    reasons.push('Credit tier supports SBA financing.')
    actions.push('Connect the buyer with a lender to get formal pre-approval.')
  } else if (input.sbaPreApproved && liquidPct >= 12 && creditOk) {
    level = 'pre_approved'
    reasons.push('SBA pre-approval on file with adequate liquidity.')
    actions.push('Source deals in their price range immediately.')
  } else if (liquidPct >= 10 && incomePct >= 15 && credit !== CREDIT_POINTS.poor) {
    level = 'qualified'
    reasons.push('Meets minimum down payment and income coverage.')
    actions.push('Get formal SBA pre-approval to move to "Pre-approved".')
  } else {
    level = 'exploring'
    if (liquidPct < 10) reasons.push(`Liquid capital is ${Math.round(liquidPct)}% of target price (10%+ needed).`)
    if (incomePct < 15) reasons.push(`Income covers ${Math.round(incomePct)}% of price annually (15%+ needed).`)
    if (!creditOk) reasons.push('Credit tier may limit SBA financing options.')
    actions.push('Build liquid reserves and/or consider seller financing.')
    actions.push('Talk to a lender about SBA 7(a) eligibility.')
  }

  return {
    level,
    levelLabel: LEVEL_LABELS[level],
    score,
    badges,
    actions,
    reasons,
  }
}
