/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/reconciliationFollowup.ts — #7 reconciliation follow-up loop (spec 08-31).
// -----------------------------------------------------------------------------
// Spec Phase 3: "If reconciliation fails or data is ambiguous: Claude generates
// a targeted follow-up question back to the advisor chat (e.g. 'I found $45,000
// in deposits that don't match reported revenue — can you clarify?'). Never
// silently estimate to force a balance."
//
// This loop owns the "ask, apply, re-run" cycle:
//   1. Detect issues: hard consistency failures (engine throws) OR ambiguity
//      (missingCategories surfaced by the engine — interest/D&A/owner comp
//      present in source financials but NOT itemized).
//   2. Generate a targeted follow-up question (Claude, deterministic template
//      fallback — the loop never stalls).
//   3. Apply the broker's answer as a labeled correction (itemized add-back
//      line or net-income correction), then RE-RUN the engine.
//   4. Loop until clean, or flag for broker review when it cannot resolve
//      (maxTurns) — never a silent estimate.
//
// The engine stays the single source of truth: every re-run passes through
// recastFinancials and its hard invariant. This module only decides WHAT to
// ask and HOW to fold the answer back in.
// =============================================================================

import { complete, isClaudeConfigured } from '@/lib/claude/client'
import {
  recastFinancials,
  type RecastInput,
  type RecastResult,
  type AddBackCategory,
} from '@/lib/recast'

// ---------------------------------------------------------------------------
// Issue model
// ---------------------------------------------------------------------------
export type ReconciliationIssueKind = 'consistency' | 'missing_category'

export interface ReconciliationIssue {
  kind: ReconciliationIssueKind
  /** Human-readable detail (the engine error line or category description). */
  detail: string
  /** Fiscal year label when the issue is year-specific (e.g. "FY2026"). */
  label?: string
  year?: number
  /** missing_category only: which add-back category the engine surfaced. */
  category?: AddBackCategory
  /** missing_category only: reported amount that is not itemized. */
  amount?: number
}

export interface FollowupQuestion {
  question: string
  suggestedAnswers: string[]
}

export interface ReconciliationOutcome {
  status: 'clean' | 'needs_input' | 'flagged'
  result?: RecastResult
  issues: ReconciliationIssue[]
  /** Latest question offered (status = needs_input). */
  question?: FollowupQuestion
  /** Final message for the pipeline notes / UI. */
  message: string
}

const MAX_TURNS = 3

// ---------------------------------------------------------------------------
// 1) Issue detection
// ---------------------------------------------------------------------------

/** Parse the engine's consistency-error lines into structured issues. */
export function issuesFromConsistencyErrors(errors: string[]): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = []
  for (const line of errors) {
    const labelMatch = line.match(/^([A-Za-z0-9 ]+?):/)
    const label = labelMatch ? labelMatch[1].trim() : undefined
    const year = label ? parseInt(label.replace(/\D/g, ''), 10) || undefined : undefined
    issues.push({ kind: 'consistency', detail: line, label, year })
  }
  return issues
}

/** Ambiguity: engine surfaced categories present in source financials but NOT
 *  itemized as add-back lines. The engine never folds these in silently — this
 *  turns each one into a targeted question. */
export function issuesFromMissingCategories(
  result: RecastResult,
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = []
  for (const yr of result.years) {
    for (const m of yr.missingCategories || []) {
      issues.push({
        kind: 'missing_category',
        detail: `${yr.label}: ${m.label} $${m.amount.toLocaleString()} is present in the source financials but not itemized as an add-back line.`,
        label: yr.label,
        year: yr.year,
        category: m.category,
        amount: m.amount,
      })
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// 2) Question generation — Claude targeted, deterministic fallback
// ---------------------------------------------------------------------------

export function deterministicQuestion(issue: ReconciliationIssue): FollowupQuestion {
  if (issue.kind === 'missing_category' && issue.category && issue.amount != null) {
    return {
      question:
        `I found ${issue.label || 'this period'}: ${issue.category.replace(/_/g, ' ')} of ` +
        `$${issue.amount.toLocaleString()} in the source financials that isn't itemized as an ` +
        `add-back line. Should I add it as a labeled add-back, and is the full amount ` +
        `recurring or one-time?`,
      suggestedAnswers: [
        `Add $${issue.amount.toLocaleString()} as recurring ${issue.category.replace(/_/g, ' ')}`,
        `Add $${issue.amount.toLocaleString()} as one-time`,
        'No — exclude it',
      ],
    }
  }
  return {
    question:
      `The reconciliation check failed for ${issue.label || 'a period'}: ${issue.detail}. ` +
      `Can you provide the correct itemized add-back line(s) or confirm the reported net income so the recast balances?`,
    suggestedAnswers: ['I will provide the corrected figure', 'Exclude the mismatch'],
  }
}

/** Claude-generated targeted follow-up (jsonMode). Falls back deterministically. */
export async function claudeFollowupQuestion(
  issue: ReconciliationIssue,
  ctxText: string,
): Promise<FollowupQuestion> {
  if (!isClaudeConfigured()) return deterministicQuestion(issue)
  try {
    const res = await complete({
      context: {
        kind: 'document',
        entityId: 'reconciliation-followup',
        text: `Issue: ${issue.detail}\n\nContext: ${ctxText.slice(0, 2000)}`,
      },
      system:
        'You are a senior business-broker financial analyst running the reconciliation gate. ' +
        'A deterministic engine found an issue that needs a human answer before documents can be generated. ' +
        'Ask ONE targeted, specific follow-up question the broker can answer quickly. Never invent figures — ' +
        'reference only the numbers in the issue. Return ONLY valid JSON: {"question": string, "suggestedAnswers": [string]} ' +
        'with 2-3 short suggested answers.',
      message: 'Generate the targeted reconciliation follow-up question.',
      jsonMode: true,
      maxTokens: 300,
    })
    const d = (res.data || {}) as Record<string, unknown>
    const question = String(d.question || '').trim()
    if (question) {
      return {
        question: question.slice(0, 500),
        suggestedAnswers: Array.isArray(d.suggestedAnswers)
          ? d.suggestedAnswers.map(String).filter(Boolean).slice(0, 4)
          : deterministicQuestion(issue).suggestedAnswers,
      }
    }
    return deterministicQuestion(issue)
  } catch {
    return deterministicQuestion(issue)
  }
}

// ---------------------------------------------------------------------------
// 3) Answer application — fold the broker's answer back into the input, then
//    the CALLER re-runs the engine. Returns the corrected input or null when
//    the answer means "no change" (exclude).
// ---------------------------------------------------------------------------

/**
 * Classify a broker answer to a missing-category question.
 *   'add'      → explicit inclusion (yes / add / the amount / recurring / one-time)
 *   'exclude'  → explicit exclusion (no / exclude / skip / don't)
 *   'ambiguous'→ anything else — the loop FLAGS this, never guesses.
 */
export function classifyMissingCategoryAnswer(answer: string): 'add' | 'exclude' | 'ambiguous' {
  const a = answer.trim().toLowerCase()
  if (/^(no|exclude|skip|don't|do not|not|remove|drop)\b/.test(a)) return 'exclude'
  if (/^(yes|add|please|correct|include|recurring|one-time|one time)/.test(a) || /\$/.test(answer)) return 'add'
  return 'ambiguous'
}

/**
 * Apply a broker answer to a missing-category issue: return the corrected
 * input with the itemized add-back line added, or null when the answer is an
 * explicit exclusion or ambiguous (the caller decides how to handle those).
 */
export function applyMissingCategoryAnswer(
  input: RecastInput,
  issue: ReconciliationIssue,
  answer: string,
): RecastInput | null {
  if (issue.kind !== 'missing_category' || issue.year == null || !issue.category || issue.amount == null) {
    return null
  }
  if (classifyMissingCategoryAnswer(answer) !== 'add') return null // exclude or ambiguous → no change
  const recurring = /one.?time|non.?recurring/.test(answer) ? false : true
  const addBacks = [...(input.addBacks || [])]
  addBacks.push({
    id: `followup_${issue.year}_${issue.category}_${Date.now()}`,
    category: issue.category,
    description: `Broker-confirmed add-back (reconciliation follow-up): ${issue.category.replace(/_/g, ' ')}`,
    amount: issue.amount,
    recurring,
    year: issue.year,
  })
  return { ...input, addBacks }
}

// ---------------------------------------------------------------------------
// 4) The loop — run, detect, ask, apply, re-run
// ---------------------------------------------------------------------------

/**
 * Run the reconciliation gate with the follow-up loop.
 *
 * @param input        RecastInput to validate
 * @param answers      Prior broker answers, indexed by the issue detail string
 *                     (the loop is resumable — persisted answers re-apply)
 * @param opts         maxTurns (default 3) and a question hook (default Claude)
 * @returns            clean → validated result; needs_input → next question;
 *                     flagged → could not resolve within maxTurns (broker review)
 */
export async function runReconciliationLoop(
  input: RecastInput,
  answers: Record<string, string> = {},
  opts: {
    maxTurns?: number
    questionFor?: (issue: ReconciliationIssue, ctx: string) => Promise<FollowupQuestion>
  } = {},
): Promise<ReconciliationOutcome> {
  const maxTurns = opts.maxTurns ?? MAX_TURNS
  const questionFor = opts.questionFor ?? ((issue: ReconciliationIssue, ctx: string) => claudeFollowupQuestion(issue, ctx))

  let currentInput = input
  let applied = 0

  for (let turn = 0; turn < maxTurns; turn++) {
    let result: RecastResult
    let hardErrors: string[] = []
    try {
      result = recastFinancials(currentInput)
    } catch (e: any) {
      hardErrors = (e?.message || '').split('\n').filter((l: string) => l.includes(':'))
      if (hardErrors.length === 0) {
        return {
          status: 'flagged',
          issues: [{ kind: 'consistency', detail: e?.message || 'Reconciliation failed' }],
          message: `Reconciliation flagged for broker review: ${e?.message || 'engine error'}`,
        }
      }
    }

    if (hardErrors.length > 0) {
      const issues = issuesFromConsistencyErrors(hardErrors)
      const open = issues.find((i) => !answers[i.detail])
      if (!open) {
        // Every surfaced issue was answered, but the engine still fails — the
        // answers didn't resolve it. Flag, never guess.
        return {
          status: 'flagged',
          issues,
          message: 'Reconciliation still failing after broker answers — flagged for review.',
        }
      }
      const q = await questionFor(open, JSON.stringify({ businessName: input.businessName, issues }))
      return { status: 'needs_input', issues, question: q, message: `Needs input: ${q.question}` }
    }

    // Engine passed the hard invariant — check ambiguity. Resolve ANY answered
    // issues first (apply add-backs, record exclusions, flag ambiguous answers),
    // then ask about the first still-unanswered one.
    const missing = issuesFromMissingCategories(result)
    if (missing.length > 0) {
      let changed = false
      for (const issue of missing) {
        const answer = answers[issue.detail]
        if (answer === undefined) continue // unanswered → ask below
        const action = classifyMissingCategoryAnswer(answer)
        if (action === 'add') {
          const corrected = applyMissingCategoryAnswer(currentInput, issue, answer)
          if (corrected) {
            currentInput = corrected
            changed = true
          }
        } else if (action === 'ambiguous') {
          // Ambiguous answer — never guess. Flag for broker review.
          return {
            status: 'flagged',
            issues: missing,
            message: `Ambiguous reconciliation answer ("${answer.slice(0, 80)}") — flagged for broker review.`,
          }
        }
        // 'exclude' → nothing to apply; the engine already excludes it.
      }
      if (changed) continue // re-run with the corrected itemized schedule

      const open = missing.find((i) => answers[i.detail] === undefined)
      if (!open) {
        // Every issue resolved (added or excluded) and nothing changed — clean.
        return {
          status: 'clean',
          result,
          issues: [],
          message: 'Reconciliation clean (ambiguity resolved).',
        }
      }
      const q = await questionFor(open, JSON.stringify({ businessName: input.businessName, issues: missing }))
      return { status: 'needs_input', issues: missing, question: q, message: `Needs input: ${q.question}` }
    }

    // Hard invariant passed and no ambiguity → clean.
    return { status: 'clean', result, issues: [], message: 'Reconciliation clean.' }
  }

  return {
    status: 'flagged',
    issues: [],
    message: `Reconciliation could not be resolved within ${maxTurns} turns — flagged for broker review.`,
  }
}
