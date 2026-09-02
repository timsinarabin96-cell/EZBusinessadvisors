/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/advisorInterview.ts — Phase 1 AI Advisor Interview (spec 08-31).
// -----------------------------------------------------------------------------
// Conversational, Claude-driven intake interview for Agent / paid Seller paths.
// Adapts each question to prior answers; covers the spec topics:
//   business_basics  — industry, years in operation, entity type, location
//   financial_overview — revenue trend, tax returns/P&Ls available, owner comp
//                        normalization, related-party transactions
//   operations       — employees, owner hours/week, lease, equipment, customer
//                      concentration
//   reason_for_sale  — reason, transition willingness, seller financing openness
//
// Design:
//   * Claude generates the NEXT question from the Q&A transcript (structured
//     JSON, jsonMode) — truly conversational and adaptive.
//   * DETERMINISTIC question bank + draft extraction as the always-on fallback
//     when Claude is unavailable (same fields, no conversation) — the manual
//     form path (sellerFormSchemas.seller_interview) remains the zero-AI
//     fallback at the UI level.
//   * On completion the transcript is folded into an IntakeDraft (same shape
//     as lib/listingIntakeCore) so Phase 3 can merge interview answers with
//     extraction output. No numbers are invented — answers carry the source Q.
// =============================================================================

import { complete, isClaudeConfigured } from '@/lib/claude/client'
import type { IntakeDraft } from '@/lib/listingIntakeCore'

// ---------------------------------------------------------------------------
// Topics (spec Phase 1)
// ---------------------------------------------------------------------------
export const ADVISOR_TOPICS = [
  'business_basics',
  'financial_overview',
  'operations',
  'reason_for_sale',
  'transition',
  'seller_financing',
] as const

export type AdvisorTopic = (typeof ADVISOR_TOPICS)[number]

export interface AdvisorQuestion {
  id: string
  topic: AdvisorTopic
  question: string
  hint?: string
  suggestedAnswers?: string[]
  /** Deterministic path only: which intake field this answer maps to. */
  field?: keyof IntakeDraft
}

export interface AdvisorAnswer {
  questionId: string
  topic: AdvisorTopic
  question: string
  answer: string
  answeredAt: string
}

export interface AdvisorSessionState {
  listingId: string
  status: 'in_progress' | 'completed'
  qa: AdvisorAnswer[]
  startedAt: string
  completedAt?: string | null
}

const PUBLIC_SYSTEM = [
  'You are a sell-side marketing writer. Given a business\'s PRIVATE record (description, industry, location, financials), draft the seller-approved ANONYMOUS public preview as JSON.',
  'Rules:',
  '- NEVER include: legal/operating business name, exact street address, phone, email, customer names, owner identity.',
  '- public_title: short, attractive, anonymous headline (e.g. "Recurring-Revenue Home Care Agency in Central PA"), max ~70 chars.',
  '- public_summary: 2-4 sentence buyer-facing summary using industry, region, and opportunity hooks. No dollar figures unless show_financials is true.',
  '- public_highlights: 3-5 one-line bullet highlights (an array of strings).',
  '- show_financials: true ONLY if the record explicitly authorizes public financials.',
  'Respond with a single JSON object with keys: public_title, public_summary, public_highlights (array), show_financials.',
].join('\n')

/**
 * Draft ONLY the anonymized public preview (public_title / public_summary /
 * public_highlights / show_financials) from a private record. Never leaks the
 * legal name, address, customer or owner identity. Deterministic fallback
 * returns an empty draft on AI failure — the caller never shows a partial leak.
 */
export async function draftPublicPreview(privateRecord: string): Promise<IntakeDraft> {
  const draft: IntakeDraft = {}
  if (!isClaudeConfigured() || !privateRecord.trim()) return draft
  try {
    const res = await complete({
      context: { kind: 'listing', entityId: 'public-preview', text: `PRIVATE RECORD:\n${privateRecord.slice(0, 8000)}\n\nDraft the anonymous public preview.` },
      system: PUBLIC_SYSTEM,
      message: 'Draft the anonymous public preview from the private record.',
      jsonMode: true,
      maxTokens: 800,
    })
    const raw = (res.data || {}) as Record<string, unknown>
    if (typeof raw.public_title === 'string' && raw.public_title.trim()) draft.public_title = raw.public_title.trim()
    if (typeof raw.public_summary === 'string' && raw.public_summary.trim()) draft.public_summary = raw.public_summary.trim()
    if (Array.isArray(raw.public_highlights)) {
      const lines = (raw.public_highlights as unknown[]).filter((h): h is string => typeof h === 'string' && h.trim().length > 0).map((h) => h.trim())
      if (lines.length) draft.public_highlights = lines.join('\n')
    }
    if (typeof raw.show_financials === 'boolean') draft.show_financials = raw.show_financials
  } catch {
    // AI flake → empty draft (no partial leak)
  }
  return draft
}

// ---------------------------------------------------------------------------
// Deterministic question bank (Claude-free fallback, one pass per topic)
// ---------------------------------------------------------------------------
export const DETERMINISTIC_QUESTIONS: AdvisorQuestion[] = [
  // business_basics
  {
    id: 'bb_industry',
    topic: 'business_basics',
    question: 'What industry is the business in, and how would you describe its specific niche?',
    hint: 'Example: Home Care Agency / companion & personal care services.',
    field: 'industry',
  },
  {
    id: 'bb_years',
    topic: 'business_basics',
    question: 'What year was the business established, and how long have you owned it?',
    hint: 'Buyers and lenders value 3+ years of history.',
    field: 'established_year',
  },
  {
    id: 'bb_entity',
    topic: 'business_basics',
    question: 'What is the legal entity type (LLC, S-Corp, C-Corp, Partnership, Sole Proprietorship)?',
    field: 'entity_type',
  },
  {
    id: 'bb_location',
    topic: 'business_basics',
    question: 'Where is the business located (city / metro area)?',
    field: 'location_general',
  },
  // financial_overview
  {
    id: 'fo_revenue',
    topic: 'financial_overview',
    question: 'What was annual revenue for the most recent full year, and is it trending up or down?',
    hint: 'Give the latest year figure — a trend note (e.g. "up ~10%") is helpful.',
    field: 'annual_revenue',
  },
  {
    id: 'fo_docs',
    topic: 'financial_overview',
    question: 'Which financial documents are available: tax returns (and which forms), P&Ls, bank statements, POS reports?',
    hint: '3+ years of tax returns / P&L is the gold standard for a defensible valuation.',
  },
  {
    id: 'fo_owner_comp',
    topic: 'financial_overview',
    question: 'What is your total annual owner compensation (salary, bonuses, personal benefits, family on payroll)?',
    hint: 'This drives the recast — accuracy here directly improves the valuation.',
    field: 'owner_comp',
  },
  {
    id: 'fo_related_party',
    topic: 'financial_overview',
    question: 'Are there any related-party transactions (renting from your own LLC, paying family-owned vendors, intercompany loans)?',
    suggestedAnswers: ['No', 'Yes — I will explain'],
  },
  // operations
  {
    id: 'op_employees',
    topic: 'operations',
    question: 'How many employees do you have (full-time, part-time, contractors)?',
    field: 'employees_full_time',
  },
  {
    id: 'op_owner_hours',
    topic: 'operations',
    question: 'How many hours per week do you personally work in the business?',
    field: 'owner_hours_weekly',
  },
  {
    id: 'op_lease',
    topic: 'operations',
    question: 'Do you lease or own the facility? What is the monthly lease and when does it expire?',
    field: 'lease_monthly',
  },
  {
    id: 'op_equipment',
    topic: 'operations',
    question: 'What equipment / FF&E is included in the sale, and roughly what is it worth?',
    field: 'ffe_value',
  },
  {
    id: 'op_concentration',
    topic: 'operations',
    question: 'What is your customer concentration — largest customer as a % of revenue, and top-ten %?',
    field: 'customer_concentration',
  },
  {
    id: 'op_years_location',
    topic: 'operations',
    question: 'How many years has the business been operating at its current location?',
    hint: 'Stability at one site is a strong buyer signal — e.g. "12 years".',
    field: 'years_at_location',
  },
  {
    id: 'op_customer_contracts',
    topic: 'operations',
    question: 'Are there any key customer contracts (long-term agreements, take-or-pay, exclusives)? Who are the largest customers?',
    field: 'key_customer_contracts',
  },
  {
    id: 'op_supplier_contracts',
    topic: 'operations',
    question: 'Are there key supplier or vendor contracts that would transfer with the business?',
    field: 'key_supplier_contracts',
  },
  {
    id: 'op_franchise',
    topic: 'operations',
    question: 'Is the business operated under a franchise or third-party licensing agreement? If so, describe the arrangement.',
    suggestedAnswers: ['No — fully independent', 'Yes — I will explain'],
    field: 'franchise_agreements',
  },
  {
    id: 'op_litigation',
    topic: 'operations',
    question: 'Are there any pending lawsuits, disputes, or legal proceedings involving the business?',
    suggestedAnswers: ['None', 'Yes — I will explain'],
    field: 'pending_litigation',
  },
  {
    id: 'op_environmental',
    topic: 'operations',
    question: 'Are there any environmental issues or concerns associated with the property or operations (e.g. underground tanks, contamination)?',
    suggestedAnswers: ['None known', 'Yes — I will explain'],
    field: 'environmental_issues',
  },
  // reason_for_sale
  {
    id: 'rs_reason',
    topic: 'reason_for_sale',
    question: 'What is your reason for selling?',
    hint: 'A credible reason builds buyer trust and speeds diligence.',
    field: 'reason_for_sale',
  },
  // transition
  {
    id: 'tr_transition',
    topic: 'transition',
    question: 'Are you willing to stay on for a transition period after the sale (weeks of full-time + months of consulting)?',
    suggestedAnswers: ['Yes, 8+ weeks full-time', 'Yes, a few weeks', 'Minimal / no transition'],
    field: 'transition_support',
  },
  // seller_financing
  {
    id: 'sf_financing',
    topic: 'seller_financing',
    question: 'Are you open to seller financing, and what terms would you consider (e.g. 10-20% of purchase price over 3-5 years)?',
    suggestedAnswers: ['Yes — open to it', 'Maybe — depends on offer', 'No'],
    field: 'seller_financing_available',
  },
]

export const DETERMINISTIC_QUESTIONS_BY_TOPIC: Record<AdvisorTopic, AdvisorQuestion[]> = ADVISOR_TOPICS.reduce(
  (acc, t) => {
    acc[t] = DETERMINISTIC_QUESTIONS.filter((q) => q.topic === t)
    return acc
  },
  {} as Record<AdvisorTopic, AdvisorQuestion[]>,
)

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
export function topicsCovered(qa: AdvisorAnswer[]): Set<AdvisorTopic> {
  return new Set(qa.map((a) => a.topic))
}

export function topicsRemaining(qa: AdvisorAnswer[]): AdvisorTopic[] {
  const covered = topicsCovered(qa)
  return ADVISOR_TOPICS.filter((t) => !covered.has(t))
}

export function isAdvisorComplete(qa: AdvisorAnswer[]): boolean {
  return topicsRemaining(qa).length === 0
}

export function advisorProgress(qa: AdvisorAnswer[]): { covered: number; total: number } {
  return { covered: topicsCovered(qa).size, total: ADVISOR_TOPICS.length }
}

/** Deterministic next question: first unanswered topic → first question there. */
export function nextDeterministicQuestion(qa: AdvisorAnswer[]): AdvisorQuestion | null {
  const answeredIds = new Set(qa.map((a) => a.questionId))
  for (const topic of ADVISOR_TOPICS) {
    const first = DETERMINISTIC_QUESTIONS_BY_TOPIC[topic].find((q) => !answeredIds.has(q.id))
    if (first) return first
  }
  return null
}

/** Normalize an answer into an intake draft field (numbers/booleans parsed). */
export function answerToDraftField(q: AdvisorQuestion, answer: string): { key: keyof IntakeDraft; value: string | number | boolean } | null {
  if (!q.field) return null
  const raw = answer.trim()
  if (!raw) return null
  const key = q.field
  const num = Number(raw.replace(/[$,%\s]/g, ''))
  if (!isNaN(num) && /[0-9]/.test(raw)) return { key, value: num }
  if (/^(yes|no|true|false)$/i.test(raw)) {
    return { key, value: /^(yes|true)$/i.test(raw) }
  }
  return { key, value: raw.slice(0, 3000) }
}

/** Deterministic draft from a completed Q&A transcript (fallback path). */
export function deterministicDraft(qa: AdvisorAnswer[]): IntakeDraft {
  const draft: IntakeDraft = {}
  for (const a of qa) {
    const q = DETERMINISTIC_QUESTIONS.find((x) => x.id === a.questionId)
    if (!q) continue
    const mapped = answerToDraftField(q, a.answer)
    if (mapped && draft[mapped.key] === undefined) {
      ;(draft as Record<string, unknown>)[mapped.key] = mapped.value
    }
  }
  return draft
}

// ---------------------------------------------------------------------------
// Claude-driven turn (adaptive next question) + final draft extraction
// ---------------------------------------------------------------------------
const SYSTEM = [
  'You are a senior business-broker intake advisor conducting a conversational interview with a business owner preparing to sell.',
  'Adapt to what they have already told you — do not re-ask answered topics, and follow up naturally when an answer is vague or raises a red flag (e.g. unexplained revenue gaps, heavy customer concentration).',
  'Ask ONE question per turn. Keep questions specific, practical, and easy to answer.',
  'Return ONLY valid JSON with EXACTLY one of these shapes:',
  '  { "done": false, "topic": "business_basics|financial_overview|operations|reason_for_sale|transition|seller_financing", "question": string, "hint": string|null, "suggestedAnswers": [string]|null }',
  '  { "done": true }',
  'Choose topics in this order: business_basics, financial_overview, operations, reason_for_sale, transition, seller_financing — skipping any already covered.',
  'Never invent financial figures. Never pressure the seller. One question only.',
].join('\n')

export async function nextAdvisorQuestionClaude(qa: AdvisorAnswer[]): Promise<AdvisorQuestion | null> {
  if (!isClaudeConfigured()) return nextDeterministicQuestion(qa)
  const covered = topicsRemaining(qa)

  const transcript = qa.length
    ? qa.map((a, i) => `${i + 1}. Q: ${a.question}\n   A: ${a.answer}`).join('\n')
    : '(no answers yet — this is the opening question)'

  const contextText = [
    `Topics still to cover: ${covered.join(', ') || 'none'}`,
    'Prior Q&A transcript:',
    transcript,
  ].join('\n')

  try {
    const res = await complete({
      context: { kind: 'listing', entityId: 'advisor-interview', text: contextText },
      system: SYSTEM,
      message: 'Ask the next interview question (or signal done if every topic is covered).',
      jsonMode: true,
      maxTokens: 500,
    })
    const d = (res.data || {}) as Record<string, unknown>
    if (d.done === true) return null
    const topic = String(d.topic || '')
    if (!(ADVISOR_TOPICS as readonly string[]).includes(topic)) return nextDeterministicQuestion(qa)
    const question = String(d.question || '').trim()
    if (!question) return nextDeterministicQuestion(qa)
    return {
      id: `claude_${topic}_${qa.length + 1}`,
      topic: topic as AdvisorTopic,
      question: question.slice(0, 500),
      hint: d.hint ? String(d.hint).slice(0, 300) : undefined,
      suggestedAnswers: Array.isArray(d.suggestedAnswers)
        ? d.suggestedAnswers.map(String).filter(Boolean).slice(0, 5)
        : undefined,
    }
  } catch {
    // AI flake → deterministic fallback. The interview never stalls.
    return nextDeterministicQuestion(qa)
  }
}

/**
 * Fold a completed transcript into an IntakeDraft. When Claude is available it
 * structures the answers into the intake field shape; otherwise the
 * deterministic mapper runs (same fields, no conversation).
 */
export async function advisorDraftFromTranscript(qa: AdvisorAnswer[]): Promise<IntakeDraft> {
  const deterministic = deterministicDraft(qa)
  if (!isClaudeConfigured() || qa.length === 0) return deterministic

  const transcript = qa.map((a, i) => `${i + 1}. Q: ${a.question}\n   A: ${a.answer}`).join('\n')
  try {
    const res = await complete({
      context: {
        kind: 'listing',
        entityId: 'advisor-draft',
        text: `Interview transcript:\n${transcript}\n\nMap the owner's answers into the listing intake draft. Return ONLY valid JSON with any of these snake_case keys that are answered: business_name, headline, industry, sub_industry, entity_type, location_general, description, asking_price, annual_revenue, sde, ebitda, established_year, employees_full_time, employees_part_time, owner_hours_weekly, owner_comp, reason_for_sale, growth_opportunities, competitive_advantages, customer_concentration, facilities_summary, lease_monthly, lease_expires_on, real_estate_included, ffe_value, seller_financing_available, financing_notes, transition_support, training_period_weeks, years_at_location, franchise_agreements, pending_litigation, environmental_issues, key_customer_contracts, key_supplier_contracts. Numbers as integers. Booleans as true/false. Omit anything not answered — never invent.`,
      },
      system: 'You map a seller interview transcript into structured listing fields. Never invent answers — only include facts the seller stated. Return only valid JSON.',
      message: 'Build the intake draft JSON from the transcript.',
      jsonMode: true,
      maxTokens: 1200,
    })
    const raw = (res.data || {}) as Record<string, unknown>
    const merged: IntakeDraft = { ...deterministic }
    for (const [k, v] of Object.entries(raw)) {
      if (v === null || v === undefined || v === '') continue
      if (typeof v === 'number' && isFinite(v)) (merged as Record<string, unknown>)[k] = v
      else if (typeof v === 'boolean') (merged as Record<string, unknown>)[k] = v
      else if (typeof v === 'string' && v.trim()) (merged as Record<string, unknown>)[k] = v.trim().slice(0, 3000)
    }
    return merged
  } catch {
    return deterministic
  }
}
