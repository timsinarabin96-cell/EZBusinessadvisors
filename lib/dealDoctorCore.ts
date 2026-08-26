/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Deal Doctor Core — pure probability-of-close scoring (zero imports)
// -----------------------------------------------------------------------------
// Deterministic scoring used by lib/dealDoctor.ts. Kept dependency-free so the
// unit tests can import it directly under Node (no path aliases).
// =============================================================================

export type DealBand = 'hot' | 'healthy' | 'at_risk' | 'stale'

export interface DealDoctorInput {
  id: string
  stage: DealStage | string
  created_at?: string | null
  updated_at?: string | null
  purchase_price?: number | null
  asking_price?: number | null
  business_name?: string | null
  industry?: string | null
  engagementCount?: number
  engagementLast14d?: number
}

export interface DealDiagnosis {
  dealId: string
  businessName: string | null
  stage: string
  stageLabel: string
  score: number
  band: DealBand
  factors: string[]
  action: string
  suggestedStage?: DealStage | null
}

export type DealStage = 'letter_of_intent' | 'under_contract' | 'due_diligence' | 'closing' | 'closed'

const STAGE_BASE: Record<string, number> = {
  letter_of_intent: 35,
  under_contract: 55,
  due_diligence: 70,
  closing: 85,
  closed: 100,
}

const STAGE_LABELS: Record<string, string> = {
  letter_of_intent: 'LOI',
  under_contract: 'Under Contract',
  due_diligence: 'Due Diligence',
  closing: 'Closing',
  closed: 'Closed',
}

export const stageLabel = (s: string | null | undefined): string =>
  STAGE_LABELS[s || ''] || s || 'Unknown'

function bandFor(score: number): DealBand {
  if (score >= 70) return 'hot'
  if (score >= 50) return 'healthy'
  if (score >= 30) return 'at_risk'
  return 'stale'
}

function actionFor(band: DealBand, stale: boolean): string {
  if (band === 'hot') return 'Push to close — schedule the closing call this week.'
  if (band === 'healthy') return 'Keep momentum — book a weekly check-in with the buyer.'
  if (band === 'at_risk') {
    if (stale) return 'Re-engage the buyer — no activity in 30+ days. Send a recap and a next-step ask.'
    return 'De-risk the deal — address the open item that is slowing the stage.'
  }
  return 'Consider dropping — cut losses and redeploy time to hotter deals.'
}

/**
 * Score one deal. Pure function — deterministic and testable.
 * Factors: stage base, deal age, staleness, price ratio, engagement.
 */
export function scoreDeal(input: DealDoctorInput): DealDiagnosis {
  const factors: string[] = []
  const now = Date.now()
  const created = input.created_at ? new Date(input.created_at).getTime() : null
  const updated = input.updated_at ? new Date(input.updated_at).getTime() : null

  let score = STAGE_BASE[input.stage] ?? 30
  factors.push(`Stage: ${stageLabel(input.stage)} (base ${score})`)

  let ageDays = 0
  if (created) {
    ageDays = Math.max(0, (now - created) / 86400000)
    if (ageDays > 180) { score -= 15; factors.push('In pipeline 180+ days (−15)') }
    else if (ageDays > 90) { score -= 8; factors.push('In pipeline 90+ days (−8)') }
  }

  let stale = false
  if (updated) {
    const daysSinceUpdate = Math.max(0, (now - updated) / 86400000)
    if (daysSinceUpdate > 30) {
      stale = true
      score -= 20
      factors.push(`No activity in ${Math.round(daysSinceUpdate)} days (−20)`)
    } else if (daysSinceUpdate > 14) {
      score -= 8
      factors.push(`Last update ${Math.round(daysSinceUpdate)} days ago (−8)`)
    } else {
      factors.push(`Updated ${Math.round(daysSinceUpdate)}d ago — active`)
    }
  }

  if (input.purchase_price != null && input.asking_price != null && input.asking_price > 0) {
    const ratio = input.purchase_price / input.asking_price
    if (ratio >= 0.95) { score += 10; factors.push('Price near asking (+10)') }
    else if (ratio >= 0.85) { score += 5; factors.push('Price within 15% of asking (+5)') }
    else if (ratio < 0.7) { score -= 10; factors.push(`Price ${Math.round(ratio * 100)}% of asking (−10)`) }
  }

  const eng = input.engagementCount ?? 0
  const engRecent = input.engagementLast14d ?? 0
  if (engRecent >= 3) { score += 12; factors.push('3+ touches in the last 14 days (+12)') }
  else if (engRecent >= 1) { score += 6; factors.push('Recent buyer engagement (+6)') }
  if (eng === 0) { score -= 5; factors.push('No tracked engagement yet (−5)') }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const band = bandFor(score)

  return {
    dealId: input.id,
    businessName: input.business_name || null,
    stage: input.stage,
    stageLabel: stageLabel(input.stage),
    score,
    band,
    factors,
    action: actionFor(band, stale),
  }
}

export const BAND_LABELS: Record<DealBand, string> = {
  hot: 'Hot — close now',
  healthy: 'Healthy — keep pushing',
  at_risk: 'At risk — re-engage',
  stale: 'Stale — consider dropping',
}

export const BAND_COLORS: Record<DealBand, string> = {
  hot: '#1e7e34',
  healthy: '#0e7490',
  at_risk: '#b45309',
  stale: '#b00020',
}
