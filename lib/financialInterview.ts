/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Financial accuracy interview — the seller portal's verification bot.
// -----------------------------------------------------------------------------
// Asks the seller a short, targeted set of questions about their uploaded
// financials (missing years, bank-vs-books gaps, add-backs, owner comp,
// one-time items). Answers become a recorded transcript (financial_interviews)
// and set seller_confirmed_at on the verified record — the human attestation
// layer on top of AI extraction + bank-vs-books checks.
//
// The question flow is DETERMINISTIC and context-driven (no model needed for
// the questions themselves — fast, free, predictable). Context is built from
// what docs exist, which years are covered, and the bank-vs-books verdict.
// =============================================================================

export interface InterviewContext {
  hasDocs: boolean
  docYears: number[]
  hasBankStatements: boolean
  bankBooksVerdict: 'verified' | 'review' | 'no_bank_docs' | null
  variancePct: number | null
  docCount: number
}

export interface InterviewQuestion {
  id: string
  question: string
  hint?: string
  answers?: string[] // suggested answers for quick-tap
}

export interface QaEntry {
  q: string
  a: string
  askedAt: string
  answeredAt: string
}

/** Build the ordered question list from context (deterministic). */
export function buildInterviewQuestions(ctx: InterviewContext): InterviewQuestion[] {
  const questions: InterviewQuestion[] = []

  // 1) Coverage check — did they share enough history?
  if (!ctx.hasDocs || ctx.docCount === 0) {
    questions.push({
      id: 'no_docs',
      question: 'We haven\u2019t received any financial documents yet. Can you confirm your business has at least 1–2 years of financial history (P&L, tax returns, or bank statements)?',
      answers: ['Yes, I\u2019ll upload them', 'Only 1 year so far', 'No records available'],
    })
  } else if (ctx.docYears.length < 2) {
    questions.push({
      id: 'coverage',
      question: `We received documents covering ${ctx.docYears.length} year${ctx.docYears.length === 1 ? '' : 's'} (${ctx.docYears.join(', ')}). Is there older financial history available? Buyers and lenders value 3+ years — more history usually means a stronger valuation.`,
      answers: ['I\u2019ll add more years', 'That\u2019s all we have'],
    })
  }

  // 2) Bank-vs-books gap (the red-flag check).
  if (ctx.bankBooksVerdict === 'review' && ctx.variancePct != null) {
    questions.push({
      id: 'bank_variance',
      question: `Our system compared your bank deposits against reported revenue and found a ${Math.abs(ctx.variancePct)}% difference. Can you help us understand why? (For example: cash sales not deposited, personal funds mixed in, or revenue includes items that aren\u2019t cash.)`,
      hint: 'Your broker sees this answer — being upfront here builds buyer trust.',
    })
  }

  // 3) Owner compensation (drives SDE accuracy).
  if (ctx.hasDocs) {
    questions.push({
      id: 'owner_comp',
      question: 'What is your total annual compensation as the owner (salary, bonuses, and personal benefits like a company car or family members on payroll)?',
      hint: 'This is a key number for the recast — the closer it is, the more accurate your valuation.',
    })
  }

  // 4) One-time / non-recurring items.
  if (ctx.hasDocs) {
    questions.push({
      id: 'one_time',
      question: 'Were there any one-time or unusual expenses in the years provided (legal settlements, equipment purchases, COVID assistance, moving costs, etc.)?',
      answers: ['No, everything was normal', 'Yes — I\u2019ll list them in the notes'],
    })
  }

  // 5) Related-party transactions.
  if (ctx.hasDocs) {
    questions.push({
      id: 'related_party',
      question: 'Do you rent from, pay, or buy from any company you or family members own? (For example, renting the building from your own LLC.)',
      answers: ['No', 'Yes — I\u2019ll explain below'],
    })
  }

  // 6) Final confirmation.
  questions.push({
    id: 'confirm',
    question: 'Last one: do you confirm the numbers you\u2019ve shared accurately reflect your business\u2019s financial performance?',
    answers: ['Yes, I confirm', 'I\u2019m not sure — I\u2019d like help'],
  })

  return questions
}

/** True once every question in the flow has been answered. */
export function isInterviewComplete(answeredCount: number, ctx: InterviewContext): boolean {
  return answeredCount >= buildInterviewQuestions(ctx).length
}

/** How many questions remain (for the UI progress indicator). */
export function questionsRemaining(answeredCount: number, ctx: InterviewContext): number {
  return Math.max(0, buildInterviewQuestions(ctx).length - answeredCount)
}
