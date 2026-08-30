/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/buyerQualify.ts — Buyer Qualification Agent core (pure, testable).
// -----------------------------------------------------------------------------
// The gate BEFORE the NDA: a short AI-style questionnaire scores the buyer
// against the listing (asking price, SDE, industry). Only qualified buyers
// are sent the NDA. Deterministic scoring — no network calls — so it is fast,
// cheap and auditable. The API route wraps this with the chat/lead plumbing.
// =============================================================================

export type QualifyDecision = 'qualified' | 'maybe' | 'not_now'

export interface QualifyAnswer {
  key: string
  value: string | number | null
}

export interface QualifyContext {
  askingPrice?: number | null
  sde?: number | null
  industry?: string | null
}

export interface QualifyResult {
  decision: QualifyDecision
  score: number // 0-100
  reasons: string[]
  /** Next action the funnel should take. */
  next: 'nda' | 'proof_of_funds' | 'hold'
}

// ---------------------------------------------------------------------------
// The questionnaire (shown by the AI agent / smart form on the listing page).
// ---------------------------------------------------------------------------

export interface QualifyQuestion {
  key: string
  label: string
  options?: string[]
  placeholder?: string
}

export const QUALIFY_QUESTIONS: QualifyQuestion[] = [
  { key: 'funds', label: 'How much cash do you have available for the purchase?', options: ['Under $50k', '$50k–$150k', '$150k–$500k', '$500k+'] },
  { key: 'financing', label: 'How do you plan to finance the deal?', options: ['All cash', 'SBA loan', 'Conventional loan', 'Seller financing', 'Mix of sources'] },
  { key: 'budget', label: 'What is your target purchase range?', options: ['Under $250k', '$250k–$500k', '$500k–$1M', '$1M+'] },
  { key: 'timeline', label: 'How soon are you looking to close?', options: ['ASAP (0–3 months)', '3–6 months', '6–12 months', 'Just exploring'] },
  { key: 'location', label: 'Preferred location / market?', placeholder: 'e.g. Harrisburg, PA or any' },
]

/** Cash available → lower bound used for scoring (midpoint of band). */
export function fundsLowerBound(answer: string | number | null | undefined): number {
  if (typeof answer === 'number') return answer
  const s = String(answer || '').replace(/[$,kK]/g, '')
  const n = Number(s)
  if (!isNaN(n)) return n * 1000 // "$150k" → 150000
  const band: Record<string, number> = { 'under $50k': 0, '$50k–$150k': 50000, '$150k–$500k': 150000, '$500k+': 500000 }
  return band[String(answer || '').toLowerCase()] ?? 0
}

/** Budget band → upper bound. */
export function budgetUpperBound(answer: string | number | null | undefined): number {
  if (typeof answer === 'number') return answer
  const band: Record<string, number> = { 'under $250k': 250000, '$250k–$500k': 500000, '$500k–$1m': 1000000, '$1m+': 5000000 }
  return band[String(answer || '').toLowerCase()] ?? 250000
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score the buyer against the listing. Pure + deterministic:
 *  - funds vs asking price            (0-35)
 *  - budget band vs asking price      (0-25)
 *  - financing method                 (0-20)
 *  - timeline                         (0-20)
 * Qualified ≥ 70 · Maybe 40–69 · Not now < 40.
 */
export function scoreQualification(answers: QualifyAnswer[], ctx: QualifyContext): QualifyResult {
  const get = (key: string) => answers.find((a) => a.key === key)?.value ?? null
  const reasons: string[] = []
  let score = 0

  const asking = ctx.askingPrice ?? 0
  const funds = fundsLowerBound(get('funds'))
  const budget = budgetUpperBound(get('budget'))

  // Funds vs asking (35 pts).
  if (asking > 0 && funds > 0) {
    const ratio = funds / asking
    if (ratio >= 1) { score += 35; reasons.push(`Cash available ($${funds.toLocaleString()}) covers the asking price`) }
    else if (ratio >= 0.5) { score += 25; reasons.push('Cash covers ≥50% of asking — strong position with financing') }
    else if (ratio >= 0.2) { score += 12; reasons.push('Cash covers ≥20% — plausible with financing') }
    else { score += 4; reasons.push('Cash on hand is thin relative to the asking price') }
  } else if (funds > 0) {
    score += 20
    reasons.push(`Reported $${funds.toLocaleString()} available`)
  }

  // Budget band vs asking (25 pts).
  if (asking > 0 && budget > 0) {
    if (budget >= asking) { score += 25; reasons.push('Target budget reaches the asking price') }
    else if (budget >= asking * 0.75) { score += 15; reasons.push('Budget is close to the asking price') }
    else { score += 5; reasons.push(`Budget (up to $${budget.toLocaleString()}) is below the asking price`) }
  }

  // Financing (20 pts).
  const fin = String(get('financing') || '').toLowerCase()
  if (fin) {
    if (fin.includes('cash')) { score += 20; reasons.push('All-cash buyer — fastest close') }
    else if (fin.includes('sba')) { score += 16; reasons.push('SBA financing — matches typical deal structure') }
    else if (fin.includes('seller')) { score += 12; reasons.push('Seller financing possible — flexible structure') }
    else if (fin.includes('mix')) { score += 14; reasons.push('Multiple funding sources') }
    else { score += 8; reasons.push('Financing method needs lender verification') }
  }

  // Timeline (20 pts).
  const tl = String(get('timeline') || '').toLowerCase()
  if (tl) {
    if (tl.includes('asap') || tl.includes('0–3')) { score += 20; reasons.push('Ready to close quickly') }
    else if (tl.includes('3–6')) { score += 14; reasons.push('Closing within 3–6 months') }
    else if (tl.includes('6–12')) { score += 8; reasons.push('Longer timeline — deal may not align') }
    else { score += 3; reasons.push('Still exploring — low urgency') }
  }

  const decision: QualifyDecision = score >= 70 ? 'qualified' : score >= 40 ? 'maybe' : 'not_now'
  const next = decision === 'qualified' ? 'nda' : decision === 'maybe' ? 'proof_of_funds' : 'hold'

  // Maybe → push over the line with verified funds? No — stay conservative;
  // proof of funds is the next step, not an automatic upgrade.

  return { decision, score: Math.min(100, score), reasons: reasons.slice(0, 5), next }
}
