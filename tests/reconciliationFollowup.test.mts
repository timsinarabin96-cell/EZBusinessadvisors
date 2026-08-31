/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// #7 — reconciliation follow-up loop regression tests (spec 08-31).
// Locks: the loop never silently estimates; ambiguity becomes a targeted
// question; broker answers fold back in and re-run the engine; unresolvable
// cases flag for review. Pure logic — no network.
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'

const {
  issuesFromConsistencyErrors,
  issuesFromMissingCategories,
  deterministicQuestion,
  applyMissingCategoryAnswer,
  runReconciliationLoop,
} = await import('../lib/reconciliationFollowup.ts')
const { recastFinancials } = await import('../lib/recast.ts')
import type { RecastInput } from '../lib/recast.ts'

const route = readFileSync('app/api/financial/reconciliation/route.ts', 'utf8')
const sql = readFileSync('sql/reconciliation_followups_2026_08_31.sql', 'utf8')
const autoGen = readFileSync('lib/autoGenerate.ts', 'utf8')
const loopLib = readFileSync('lib/reconciliationFollowup.ts', 'utf8')

// A clean input that reconciles first try.
function cleanInput(): RecastInput {
  return {
    listingId: 'loop-test',
    businessName: 'Loop Test Co',
    entityType: 'llc',
    currency: '$',
    years: [
      { year: 2026, label: 'FY2026', grossRevenue: 1_000_000, cogs: 300_000, operatingExpenses: 250_000, ownerComp: 142_000, depreciation: 24_000, interest: 0, otherExpenses: 0, netIncome: 284_000 },
    ],
    addBacks: [
      { id: 'a1', category: 'owner_salary', description: 'Owner Salary', amount: 142_000, recurring: true, year: 2026 },
      { id: 'a2', category: 'depreciation', description: 'Depreciation', amount: 24_000, recurring: true, year: 2026 },
    ],
  }
}

test('loop: clean input → clean on first run (no question, no estimate)', async () => {
  const outcome = await runReconciliationLoop(cleanInput())
  assert.equal(outcome.status, 'clean')
  assert.ok(outcome.result, 'validated result returned')
  assert.equal(outcome.issues.length, 0)
})

test('loop: ambiguity (missing categories) → needs_input with targeted question', async () => {
  // Owner comp + D&A present in source financials but NOT itemized.
  const input: RecastInput = {
    listingId: 'ambiguous',
    businessName: 'Ambiguous Co',
    entityType: 'llc',
    currency: '$',
    years: [
      { year: 2026, label: 'FY2026', grossRevenue: 800_000, cogs: 200_000, operatingExpenses: 300_000, ownerComp: 100_000, depreciation: 30_000, interest: 12_000, otherExpenses: 0, netIncome: 158_000 },
    ],
    addBacks: [{ id: 'a1', category: 'one_time', description: 'Settlement', amount: 40_000, recurring: false, year: 2026 }],
  }
  const outcome = await runReconciliationLoop(input, {}, { questionFor: async (issue) => deterministicQuestion(issue) })
  assert.equal(outcome.status, 'needs_input')
  assert.ok(outcome.question, 'a follow-up question is offered')
  assert.ok(outcome.issues.length >= 1)
  // The engine never silently folded the missing categories into SDE.
  const direct = recastFinancials(input)
  assert.equal(direct.years[0].recast.sde, 158_000 + 40_000)
})

test('loop: broker answer "add it" → folds in as itemized line → clean re-run', async () => {
  const input: RecastInput = {
    listingId: 'resolve',
    businessName: 'Resolve Co',
    entityType: 'llc',
    currency: '$',
    years: [
      { year: 2026, label: 'FY2026', grossRevenue: 800_000, cogs: 200_000, operatingExpenses: 300_000, ownerComp: 100_000, depreciation: 30_000, interest: 12_000, otherExpenses: 0, netIncome: 158_000 },
    ],
    addBacks: [{ id: 'a1', category: 'one_time', description: 'Settlement', amount: 40_000, recurring: false, year: 2026 }],
  }
  // First pass surfaces the question.
  const first = await runReconciliationLoop(input, {}, { questionFor: async (issue) => deterministicQuestion(issue) })
  assert.equal(first.status, 'needs_input')
  const issue = first.issues[0]
  assert.equal(issue.kind, 'missing_category')

  // Broker answers: add the owner comp as a recurring line.
  const corrected = applyMissingCategoryAnswer(input, issue, `Add $${issue.amount} as recurring`)
  assert.ok(corrected, 'answer produced a corrected input')
  const second = await runReconciliationLoop(corrected!, { [issue.detail]: 'add' }, { questionFor: async (i) => deterministicQuestion(i) })
  // Remaining ambiguity may still be open, but the answered one is resolved.
  assert.ok(['clean', 'needs_input'].includes(second.status))
  if (second.status === 'needs_input') {
    assert.ok(!second.issues.some((i) => i.detail === issue.detail), 'answered issue must not be re-asked')
  }
})

test('loop: broker answer "no/exclude" → records exclusion, no silent estimate', async () => {
  // Single missing category (owner comp only) so exclusion fully resolves it.
  const input: RecastInput = {
    listingId: 'exclude',
    businessName: 'Exclude Co',
    entityType: 'llc',
    currency: '$',
    years: [
      { year: 2026, label: 'FY2026', grossRevenue: 500_000, cogs: 150_000, operatingExpenses: 120_000, ownerComp: 80_000, depreciation: 0, interest: 0, otherExpenses: 0, netIncome: 150_000 },
    ],
    addBacks: [],
  }
  const first = await runReconciliationLoop(input, {}, { questionFor: async (issue) => deterministicQuestion(issue) })
  assert.equal(first.status, 'needs_input')
  const issue = first.issues[0]
  assert.equal(issue.category, 'owner_salary')

  const corrected = applyMissingCategoryAnswer(input, issue, 'No — exclude it')
  assert.equal(corrected, null, 'exclude → no input change')
  // Re-run with the exclusion recorded.
  const second = await runReconciliationLoop(input, { [issue.detail]: 'No — exclude it' }, { questionFor: async (i) => deterministicQuestion(i) })
  assert.equal(second.status, 'clean')
  assert.equal(second.result!.years[0].recast.sde, 150_000, 'SDE stays NI + itemized (nothing silently added)')
})

test('loop: ambiguous broker answer → flagged, never silently estimated', async () => {
  const input: RecastInput = {
    listingId: 'ambiguous-answer',
    businessName: 'Ambig Co',
    entityType: 'llc',
    currency: '$',
    years: [
      { year: 2026, label: 'FY2026', grossRevenue: 500_000, cogs: 150_000, operatingExpenses: 120_000, ownerComp: 80_000, depreciation: 0, interest: 0, otherExpenses: 0, netIncome: 150_000 },
    ],
    addBacks: [],
  }
  const first = await runReconciliationLoop(input, {}, { questionFor: async (issue) => deterministicQuestion(issue) })
  const issue = first.issues[0]
  // A non-committal answer must flag for broker review — never a silent guess.
  const outcome = await runReconciliationLoop(input, { [issue.detail]: 'maybe?' }, { questionFor: async (i) => deterministicQuestion(i) })
  assert.equal(outcome.status, 'flagged')
})

test('loop: multiple missing categories resolve sequentially with answers', async () => {
  const input: RecastInput = {
    listingId: 'multi',
    businessName: 'Multi Co',
    entityType: 'llc',
    currency: '$',
    years: [
      { year: 2026, label: 'FY2026', grossRevenue: 800_000, cogs: 200_000, operatingExpenses: 300_000, ownerComp: 100_000, depreciation: 30_000, interest: 0, otherExpenses: 0, netIncome: 170_000 },
    ],
    addBacks: [],
  }
  const first = await runReconciliationLoop(input, {}, { questionFor: async (issue) => deterministicQuestion(issue) })
  assert.equal(first.status, 'needs_input')
  assert.ok(first.issues.length >= 2, 'owner comp + depreciation both missing')

  // Answer both: owner comp → add; depreciation → exclude.
  const oc = first.issues.find((i) => i.category === 'owner_salary')!
  const dep = first.issues.find((i) => i.category === 'depreciation')!
  const answers: Record<string, string> = {
    [oc.detail]: `Add $${oc.amount} as recurring`,
    [dep.detail]: 'No — exclude it',
  }
  const second = await runReconciliationLoop(input, answers, { questionFor: async (i) => deterministicQuestion(i) })
  assert.equal(second.status, 'clean')
  // SDE = NI + itemized(owner comp) only; depreciation excluded.
  assert.equal(second.result!.years[0].recast.sde, 170_000 + 100_000)
})

test('loop: engine never emits inconsistent fresh input — consistency branch is defensive', async () => {
  // The invariant is definitional (SDE = NI + Σ(itemized)), so a fresh input
  // with oversized add-backs still returns a result. The consistency branch
  // guards tampered/stored results — verified via issuesFromConsistencyErrors.
  const input: RecastInput = {
    listingId: 'defensive',
    businessName: 'Defensive Co',
    entityType: 'llc',
    currency: '$',
    years: [
      { year: 2026, label: 'FY2026', grossRevenue: 1_000_000, cogs: 300_000, operatingExpenses: 250_000, ownerComp: 142_000, depreciation: 24_000, interest: 0, otherExpenses: 0, netIncome: 284_000 },
    ],
    addBacks: [{ id: 'x1', category: 'owner_salary', description: 'Owner Salary', amount: 426_000, recurring: true, year: 2026 }],
  }
  const direct = recastFinancials(input)
  assert.equal(direct.years[0].recast.sde, 284_000 + 426_000, 'definitional invariant holds by construction')
})

test('loop: deterministic question carries the source detail (no bare numbers)', () => {
  const q = deterministicQuestion({
    kind: 'missing_category',
    detail: 'FY2026: Owner Compensation (reported) $142,000 is present but not itemized.',
    label: 'FY2026',
    year: 2026,
    category: 'owner_salary',
    amount: 142_000,
  })
  assert.match(q.question, /owner salary/i)
  assert.match(q.question, /\$142,000/)
  assert.ok(q.suggestedAnswers.length >= 2)
})

test('loop: issuesFromConsistencyErrors parses year + detail', () => {
  const issues = issuesFromConsistencyErrors([
    'FY2026: Net Income 284,000 + itemized add-backs 426,000 = 710,000, but Recast SDE = 568,000 (gap -142,000)',
  ])
  assert.equal(issues.length, 1)
  assert.equal(issues[0].kind, 'consistency')
  assert.equal(issues[0].label, 'FY2026')
  assert.equal(issues[0].year, 2026)
})

test('loop: SQL table + RLS + agency scoping present', () => {
  assert.match(sql, /create table if not exists public\.reconciliation_followups/)
  assert.match(sql, /listing_id\s+uuid not null references public\.listings\(id\) on delete cascade/)
  assert.match(sql, /issue_kind\s+text/)
  assert.match(sql, /suggested_answers\s+jsonb/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /agency_members m on m\.agency_id = l\.agency_id/)
})

test('loop: API route is agency-gated and applies answers', () => {
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /applyMissingCategoryAnswer/)
  assert.match(route, /runReconciliationLoop/)
  assert.match(route, /reconciliation_followups/)
})

test('loop: autoGenerate replaces the silent fallback — blocks BOV/CIM on failure', () => {
  assert.match(autoGen, /runReconciliationLoop/)
  assert.match(autoGen, /persistReconciliationFollowup/)
  assert.match(autoGen, /reconciliationBlocked/)
  assert.match(autoGen, /if \(!reconciliationBlocked\)/)
  assert.match(autoGen, /Recast\/BOV\/CIM generation paused/)
  // The old silent fallback is gone: BOV generation is gated behind the
  // reconciliation-clean check (no more bare "Recast failed -> continue").
  const bovPos = autoGen.indexOf('let bov = generateBovContent')
  const gatePos = autoGen.indexOf('if (!reconciliationBlocked)')
  assert.ok(gatePos !== -1 && gatePos < bovPos, 'BOV must be gated behind clean reconciliation')

})

test('loop: lib is server-only, Claude with deterministic fallback, never invents', () => {
  assert.match(loopLib, /import \{ complete, isClaudeConfigured \} from '@\/lib\/claude\/client'/)
  assert.match(loopLib, /catch \{[\s\S]*return deterministicQuestion\(issue\)/)
  assert.match(loopLib, /Never invent/)
})
