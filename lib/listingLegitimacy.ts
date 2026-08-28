/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/listingLegitimacy.ts — THE Listing Legitimacy Gate (AI-first).
// -----------------------------------------------------------------------------
// Boss's rule: "we don't want premature businesses or scam listings".
// A listing can only go ACTIVE when this gate says auto_approved:
//   * 3 years of financials must be on file (uploaded + declared revenue)
//   * business must be at least MIN_BUSINESS_AGE_YEARS old
//   * revenue trend must be plausible (no sustained 3x+ spikes / collapses)
//   * scam-risk score (scamDetectionCore) must be < AUTO_APPROVE_MAX_RISK
// Verdicts:
//   pending        → financials missing → listing cannot go live (blocked)
//   auto_approved  → AI cleared → publish allowed (goes active)
//   broker_review  → medium risk → human reviews in /dashboard/review-queue
//   rejected       → premature/scam signals → never goes live
// Pure & deterministic — unit-tested in tests/listingLegitimacy.test.mts.
// =============================================================================

export const MIN_BUSINESS_AGE_YEARS = 3
export const AUTO_APPROVE_MAX_RISK = 30
export const BROKER_REVIEW_MAX_RISK = 55

export type LegitimacyVerdict = 'pending' | 'auto_approved' | 'broker_review' | 'rejected'

export interface LegitimacyInput {
  /** Year the business was established (listings.established_year). */
  establishedYear?: number | null
  /** Revenue 3 fiscal years ago (listings.revenue_year_1). */
  revenueYear1?: number | null
  /** Revenue 2 fiscal years ago (listings.revenue_year_2). */
  revenueYear2?: number | null
  /** Revenue last full fiscal year (listings.revenue_year_3). */
  revenueYear3?: number | null
  /** 0–100 scam-risk from scamDetectionCore (assessListingRisk). */
  scamScore?: number | null
  /** financials_status: missing | submitted | approved | rejected. */
  financialsStatus?: string | null
}

export interface LegitimacyReport {
  verdict: LegitimacyVerdict
  /** 0–100 legitimacy confidence (100 = fully legit). */
  score: number
  reasons: string[]
}

const fmt = (n: number | null | undefined): string =>
  n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })

/**
 * Deterministic AI gate. Never throws. Order matters: the hardest blockers
 * (missing financials, young business) short-circuit before softer signals.
 */
export function assessLegitimacy(input: LegitimacyInput, now: Date = new Date()): LegitimacyReport {
  const reasons: string[] = []
  let score = 100

  const age = input.establishedYear ? now.getFullYear() - input.establishedYear : null

  // 1) 3 years of financials must be on file — the anti-premature/scam floor.
  const years = [input.revenueYear1, input.revenueYear2, input.revenueYear3]
  const hasAllYears = years.every((v) => typeof v === 'number' && Number.isFinite(v))
  const allPositive = hasAllYears && years.every((v) => (v as number) > 0)
  if (!hasAllYears || input.financialsStatus === 'missing') {
    reasons.push('3 years of financials are required before a listing can go live')
    return { verdict: 'pending', score: Math.min(score, 20), reasons }
  }
  if (!allPositive) {
    reasons.push('Revenue must be positive for all 3 declared years')
    return { verdict: 'rejected', score: Math.min(score, 25), reasons }
  }
  if (input.financialsStatus === 'rejected') {
    reasons.push('Submitted financials were rejected — please re-upload valid documents')
    return { verdict: 'rejected', score: Math.min(score, 10), reasons }
  }

  // 2) Premature business: must be ≥ 3 years old.
  if (age == null || age < MIN_BUSINESS_AGE_YEARS) {
    reasons.push(
      `Business must be at least ${MIN_BUSINESS_AGE_YEARS} years old (established ${input.establishedYear ?? 'unknown'})`,
    )
    return { verdict: 'rejected', score: Math.min(score, 15), reasons }
  }

  const r1 = input.revenueYear1 as number
  const r2 = input.revenueYear2 as number
  const r3 = input.revenueYear3 as number

  // 3) Implausible trends — the classic fake-financials tells. A sustained
  //    3x+ jump or sustained collapse needs human eyes, never auto-approval.
  if (r2 > r1 * 3 && r3 > r2 * 3) {
    reasons.push(`Revenue trend looks implausible (sustained 3x+ jumps: ${fmt(r1)} → ${fmt(r2)} → ${fmt(r3)}) — broker review required`)
    return { verdict: 'broker_review', score: Math.min(score, 55), reasons }
  }
  if (r2 < r1 * 0.5 && r3 < r2 * 0.5) {
    reasons.push(`Revenue shows a sustained collapse (${fmt(r1)} → ${fmt(r2)} → ${fmt(r3)}) — broker review required`)
    return { verdict: 'broker_review', score: Math.min(score, 55), reasons }
  }
  if (r3 < r2 * 0.4) {
    reasons.push(`Revenue dropped sharply in the latest year (${fmt(r2)} → ${fmt(r3)})`)
    score -= 20
  }
  if (r3 > r1 * 8) {
    reasons.push(`Revenue grew more than 8x across the 3 years (${fmt(r1)} → ${fmt(r3)}) — unusually aggressive`)
    score -= 15
  }

  // 4) Scam-risk band from scamDetectionCore.
  const risk = input.scamScore ?? 0
  if (risk >= BROKER_REVIEW_MAX_RISK) {
    reasons.push(`High scam-risk score (${risk}/100)`)
    return { verdict: 'rejected', score: Math.min(score, 10), reasons }
  }
  if (risk >= AUTO_APPROVE_MAX_RISK) {
    reasons.push(`Moderate scam-risk score (${risk}/100) — broker review required`)
    return { verdict: 'broker_review', score: Math.min(score, 55), reasons }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  if (reasons.length === 0) reasons.push('Passed the legitimacy gate (3+ yrs, financials on file, low risk)')
  return { verdict: 'auto_approved', score, reasons }
}
