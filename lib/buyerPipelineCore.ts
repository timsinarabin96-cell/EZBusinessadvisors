/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Buyer Pipeline Core — pure logic for the buyer → closing → follow-up CRM.
// -----------------------------------------------------------------------------
// Stage model, stage transitions, buyer heat scoring, NQA (qualification
// questionnaire) scoring, and the no-reply escalation ladder. All pure
// functions — no I/O — so they are unit-testable and shared by the API and UI.
// =============================================================================

export const BUYER_STAGES = [
  'new',
  'contacted',
  'nda_sent',
  'nda_signed',
  'qualified',
  'data_room',
  'loi',
  'negotiation',
  'closed',
  'lost',
] as const

export type BuyerStage = (typeof BUYER_STAGES)[number]

export const STAGE_META: Record<BuyerStage, { label: string; icon: string; desc: string }> = {
  new:          { label: 'New',          icon: '🆕', desc: 'Just captured' },
  contacted:    { label: 'Contacted',    icon: '📨', desc: 'First touch made' },
  nda_sent:     { label: 'NDA sent',     icon: '📄', desc: 'Confidentiality sent' },
  nda_signed:   { label: 'NDA signed',   icon: '✍️', desc: 'Can see financials' },
  qualified:    { label: 'Qualified',    icon: '✅', desc: 'Financially verified' },
  data_room:    { label: 'Data room',    icon: '📁', desc: 'Active diligence' },
  loi:          { label: 'LOI',          icon: '📝', desc: 'Letter of intent' },
  negotiation:  { label: 'Negotiation',  icon: '🤝', desc: 'Terms being worked' },
  closed:       { label: 'Closed',       icon: '🏁', desc: 'Deal done' },
  lost:         { label: 'Lost',         icon: '🚫', desc: 'Went another way' },
}

/** Stages that count as "active/working" for funnel stats. */
export const ACTIVE_STAGES: BuyerStage[] = ['contacted', 'nda_sent', 'nda_signed', 'qualified', 'data_room', 'loi', 'negotiation']

/** Ordered index for comparisons. */
export function stageIndex(s: string): number {
  const i = BUYER_STAGES.indexOf(s as BuyerStage)
  return i === -1 ? 0 : i
}

/** True when `a` is further along the pipeline than `b`. */
export function isStageAfter(a: string, b: string): boolean {
  return stageIndex(a) > stageIndex(b)
}

// ---------------------------------------------------------------------------
// Buyer heat — 0-100 behavioral engagement score.
// Combines profile fit, live behavior (data room, responsiveness), and
// qualification signals. Higher = hotter buyer.
// ---------------------------------------------------------------------------
export interface HeatInputs {
  /** 0-100 profile fit from buyer matching (or 0 if unknown). */
  fitScore?: number | null
  /** True when the buyer signed the NDA. */
  ndaSigned?: boolean
  /** True when financially qualified / verified funds. */
  financiallyQualified?: boolean
  /** Number of data-room folders/files viewed (intent signal). */
  dataRoomViews?: number
  /** Number of inbound replies/touches in the last 14 days. */
  recentReplies?: number
  /** True when a valid offer has been made. */
  hasOffer?: boolean
  /** Days since the buyer's last meaningful activity (decay). */
  daysSinceActivity?: number | null
}

export function computeHeatScore(input: HeatInputs): number {
  let score = 0

  // Profile fit (0-30)
  const fit = Math.max(0, Math.min(30, Math.round((input.fitScore ?? 0) * 0.3)))

  // Qualification (0-25)
  if (input.ndaSigned) score += 10
  if (input.financiallyQualified) score += 15

  // Behavior / intent (0-35)
  score += Math.min(15, (input.dataRoomViews ?? 0) * 3)
  score += Math.min(10, (input.recentReplies ?? 0) * 3)
  if (input.hasOffer) score += 10

  // Recency decay (0-10): no activity in 14+ days costs up to 10 points.
  const days = input.daysSinceActivity
  if (days !== null && days !== undefined) {
    score -= Math.min(10, Math.max(0, days - 3) * 1.5)
  }

  return Math.max(0, Math.min(100, Math.round(score + fit)))
}

export function heatBand(score: number): { label: string; color: string } {
  if (score >= 70) return { label: '🔥 Hot', color: '#b91c1c' }
  if (score >= 40) return { label: 'Warm', color: '#9a6700' }
  if (score >= 15) return { label: 'Cool', color: '#2563eb' }
  return { label: 'Cold', color: '#6b7280' }
}

// ---------------------------------------------------------------------------
// NQA — qualification questionnaire. Ask on first contact; score the answers.
// ---------------------------------------------------------------------------
export interface NqaQuestion {
  key: string
  question: string
  /** Higher weight = more important for qualification. */
  weight: number
  /** Optional set of acceptable "yes" answers for boolean-ish checks. */
  goodAnswers?: string[]
}

export const NQA_QUESTIONS: NqaQuestion[] = [
  { key: 'budget', question: 'What is your purchase budget range?', weight: 3 },
  { key: 'funds', question: 'Do you have verified funds or financing in place?', weight: 3, goodAnswers: ['yes', 'cash', 'sba pre-approved', 'pre-approved', 'funded'] },
  { key: 'timeline', question: 'What is your buying timeline?', weight: 2, goodAnswers: ['asap', 'immediately', '1-3 months', 'this quarter', 'now'] },
  { key: 'industry', question: 'Which industries are you targeting?', weight: 1 },
  { key: 'location', question: 'What geographic area are you looking in?', weight: 1 },
  { key: 'experience', question: 'Do you have operating experience in this industry?', weight: 1, goodAnswers: ['yes', 'y', '10+', '5+', '3+'] },
]

/** Score an NQA response set 0-100. Missing answers score 0 for that question. */
export function scoreNqa(answers: Record<string, string | undefined>): number {
  let total = 0
  let max = 0
  for (const q of NQA_QUESTIONS) {
    max += q.weight * 100
    const a = (answers[q.key] || '').trim().toLowerCase()
    if (!a) continue
    if (q.goodAnswers) {
      total += q.goodAnswers.some((g) => a.includes(g)) ? q.weight * 100 : q.weight * 30
    } else {
      total += q.weight * 70 // answered but subjective → partial credit
    }
  }
  return max === 0 ? 0 : Math.round((total / max) * 100)
}

export function nqaVerdict(score: number): { verdict: 'qualified' | 'review' | 'not_fit'; label: string } {
  if (score >= 70) return { verdict: 'qualified', label: 'Qualified — strong buyer' }
  if (score >= 40) return { verdict: 'review', label: 'Review — needs a conversation' }
  return { verdict: 'not_fit', label: 'Not a fit — save for later' }
}

// ---------------------------------------------------------------------------
// No-reply escalation ladder — day-based follow-up cadence.
// ---------------------------------------------------------------------------
export interface LadderStep {
  day: number
  channel: 'email' | 'sms' | 'call' | 'email_final'
  label: string
}

export const ESCALATION_LADDER: LadderStep[] = [
  { day: 1, channel: 'email', label: 'Day 1 — soft touch (reply window)' },
  { day: 3, channel: 'email', label: 'Day 3 — value nudge' },
  { day: 7, channel: 'call', label: 'Day 7 — voice call task' },
  { day: 14, channel: 'email_final', label: 'Day 14 — final break-up email' },
]

/** Next ladder step due for a silent lead. Null when none is due. */
export function nextLadderStep(daysSilent: number, ladder = ESCALATION_LADDER): LadderStep | null {
  let due: LadderStep | null = null
  for (const step of ladder) {
    if (daysSilent >= step.day) due = step
  }
  return due
}

// ---------------------------------------------------------------------------
// Closing runway — reverse timeline from a target close date.
// ---------------------------------------------------------------------------
export interface RunwayTask {
  key: string
  label: string
  /** Days before close this must be done. */
  offsetDays: number
}

export const CLOSING_RUNWAY_TASKS: RunwayTask[] = [
  { key: 'diligence', label: 'Diligence complete', offsetDays: 30 },
  { key: 'pa', label: 'Purchase agreement signed', offsetDays: 21 },
  { key: 'escrow', label: 'Escrow funded', offsetDays: 14 },
  { key: 'inventory', label: 'Inventory valuation final', offsetDays: 10 },
  { key: 'training', label: 'Transition/training schedule set', offsetDays: 7 },
  { key: 'success_fee', label: 'Success fee invoiced', offsetDays: 3 },
]

export interface RunwayItem extends RunwayTask {
  dueDate: string // ISO date
  overdue: boolean
  daysLeft: number
}

/** Compute the reverse-timeline from a target close date (ISO string or Date). */
export function computeClosingRunway(closeDate: string | Date, tasks = CLOSING_RUNWAY_TASKS): RunwayItem[] {
  // Parse as LOCAL date-only so ISO strings don't shift a day via UTC.
  const c = new Date(closeDate)
  const close = new Date(c.getFullYear(), c.getMonth(), c.getDate())
  close.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return tasks.map((t) => {
    const due = new Date(close)
    due.setDate(due.getDate() - t.offsetDays)
    due.setHours(0, 0, 0, 0)
    const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000)
    return { ...t, dueDate: fmt(due), overdue: daysLeft < 0, daysLeft }
  })
}

// ---------------------------------------------------------------------------
// Funnel stats — per-listing pipeline health.
// ---------------------------------------------------------------------------
export function pipelineFunnel(buyers: Array<{ pipeline_stage?: string | null }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of BUYER_STAGES) out[s] = 0
  for (const b of buyers) {
    const s = b.pipeline_stage as BuyerStage
    if (out[s] !== undefined) out[s] += 1
  }
  return out
}

export function conversionRate(funnel: Record<string, number>, from: BuyerStage, to: BuyerStage): number | null {
  const f = funnel[from] || 0
  if (f === 0) return null
  return Math.round(((funnel[to] || 0) / f) * 100)
}
