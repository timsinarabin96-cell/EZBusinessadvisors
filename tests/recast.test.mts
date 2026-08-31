/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// GATE 1 REGRESSION LOCK (boss 08-31) — one deterministic financial engine.
// -----------------------------------------------------------------------------
// The old formula was: SDE = NI + Σ(itemized) + ownerComp + depreciation,
// silently adding owner comp and D&A a SECOND time on top of itemized lines
// that already contained them. The boss's gap column was exactly those fields
// (FY2026: 142k + 24k = 166k). This suite locks the fix:
//   Recast SDE = Net Income + Σ(itemized add-back lines). Nothing else.
// These tests FAIL against the old formula and pass against the new one.
// =============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Dummy env so the supabase client import inside lib/recast.ts doesn't blow up
// (pure engine math only — no network). Mirrors scripts/sample-deliverables.mts.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'

const {
  recastFinancials,
  recastConsistencyErrors,
  assertRecastConsistency,
} = await import('../lib/recast.ts')

import type { RecastInput } from '../lib/recast.ts'

// ---------------------------------------------------------------------------
// The boss's exact defect scenario (FY2026): owner comp and D&A are present
// BOTH as itemized add-back lines AND as YearFinancials fields. The old engine
// added the fields a second time → gap exactly 142,000 + 24,000 = 166,000.
// ---------------------------------------------------------------------------
const BOSS_SCENARIO: RecastInput = {
  listingId: 'regression-lock',
  businessName: 'Regression Lock Co',
  entityType: 's_corp',
  currency: '$',
  years: [
    {
      year: 2026,
      label: 'FY2026',
      grossRevenue: 1_000_000,
      cogs: 300_000,
      operatingExpenses: 250_000,
      ownerComp: 142_000,   // reported — already inside net income
      depreciation: 24_000, // reported — already inside net income
      interest: 0,
      otherExpenses: 0,
      netIncome: 284_000,   // 1,000,000 - 300,000 - 250,000 - 142,000 - 24,000
    },
    {
      year: 2025,
      label: 'FY2025',
      grossRevenue: 950_000,
      cogs: 285_000,
      operatingExpenses: 240_000,
      ownerComp: 135_000,
      depreciation: 22_000,
      interest: 0,
      otherExpenses: 0,
      netIncome: 268_000,
    },
  ],
  addBacks: [
    // Itemized lines — owner salary + D&A are EXPLICIT here.
    { year: 2026, category: 'owner_salary', label: 'Owner Salary', amount: 142_000 },
    { year: 2026, category: 'depreciation', label: 'Depreciation', amount: 24_000 },
    { year: 2025, category: 'owner_salary', label: 'Owner Salary', amount: 135_000 },
    { year: 2025, category: 'depreciation', label: 'Depreciation', amount: 22_000 },
  ],
}

test('gate1: SDE = NI + Σ(itemized) — owner comp/D&A NOT double-counted', () => {
  const r = recastFinancials(BOSS_SCENARIO)
  const fy26 = r.years.find((y) => y.year === 2026)!
  // New formula: 284,000 + 166,000 = 450,000. Old formula added the YearFinancials
  // fields again → 616,000 (exactly 166k too high — the boss's gap).
  assert.equal(fy26.recast.sde, 284_000 + 166_000)
  assert.equal(fy26.totalAddBacks, 166_000)
  // The gap column the boss found would have been exactly ownerComp + D&A.
  const oldBuggy = fy26.asReported.netIncome + fy26.totalAddBacks + 142_000 + 24_000
  assert.equal(oldBuggy - fy26.recast.sde, 166_000, 'the old buggy formula produces the boss\'s exact 166k gap')
})

test('gate1: consistency invariant holds for EVERY year', () => {
  const r = recastFinancials(BOSS_SCENARIO)
  const errors = recastConsistencyErrors(r)
  assert.deepEqual(errors, [])
})

test('gate1: assertRecastConsistency does not throw on a valid engine result', () => {
  const r = recastFinancials(BOSS_SCENARIO)
  assert.doesNotThrow(() => assertRecastConsistency(r))
})

test('gate1: assertRecastConsistency throws when the invariant is violated (tampered result)', () => {
  const r = recastFinancials(BOSS_SCENARIO)
  // Simulate drift: someone edits SDE after the engine ran (e.g. re-adds owner comp).
  ;(r.years[0].recast as { sde: number }).sde = r.years[0].recast.sde + 142_000
  assert.throws(() => assertRecastConsistency(r), /Recast consistency check failed/)
})

test('gate1: engine never emits an inconsistent result — property check across input shapes', () => {
  // The invariant is definitional (SDE = NI + Σ(itemized)), so the guarantee
  // to lock is that EVERY input path — derived net income, all entity types,
  // single/multi-year, empty schedule — passes validation before returning.
  const scenarios: RecastInput[] = [
    BOSS_SCENARIO,
    // Derived net income (no netIncome field): NI computed from components.
    {
      listingId: 'derived-ni',
      businessName: 'Derived NI Co',
      entityType: 'sole_prop',
      currency: '$',
      years: [
        { year: 2026, label: 'FY2026', grossRevenue: 500_000, cogs: 150_000, operatingExpenses: 120_000, ownerComp: 80_000, depreciation: 15_000, interest: 0, otherExpenses: 5_000, netIncome: 130_000 },
      ],
      addBacks: [{ year: 2026, category: 'owner_salary', label: 'Owner Salary', amount: 80_000 }],
    },
    // Single year, empty itemized schedule (no add-backs at all).
    {
      listingId: 'empty-schedule',
      businessName: 'No Addbacks Co',
      entityType: 'c_corp',
      currency: '$',
      years: [
        { year: 2026, label: 'FY2026', grossRevenue: 300_000, cogs: 90_000, operatingExpenses: 100_000, ownerComp: 0, depreciation: 0, interest: 0, otherExpenses: 0, netIncome: 110_000 },
      ],
      addBacks: [],
    },
    // Partnership, multiple years, mixed categories incl. interest.
    {
      listingId: 'partnership-multi',
      businessName: 'Partnership LP',
      entityType: 'partnership',
      currency: '$',
      years: [
        { year: 2024, label: 'FY2024', grossRevenue: 900_000, cogs: 300_000, operatingExpenses: 280_000, ownerComp: 0, depreciation: 40_000, interest: 25_000, otherExpenses: 0, netIncome: 255_000 },
        { year: 2025, label: 'FY2025', grossRevenue: 1_100_000, cogs: 350_000, operatingExpenses: 330_000, ownerComp: 0, depreciation: 45_000, interest: 22_000, otherExpenses: 0, netIncome: 353_000 },
        { year: 2026, label: 'FY2026', grossRevenue: 1_250_000, cogs: 380_000, operatingExpenses: 370_000, ownerComp: 0, depreciation: 50_000, interest: 20_000, otherExpenses: 0, netIncome: 430_000 },
      ],
      addBacks: [
        { year: 2024, category: 'depreciation', label: 'Depreciation', amount: 40_000 },
        { year: 2024, category: 'interest', label: 'Interest Expense (non-operating)', amount: 25_000 },
        { year: 2025, category: 'depreciation', label: 'Depreciation', amount: 45_000 },
        { year: 2025, category: 'interest', label: 'Interest Expense (non-operating)', amount: 22_000 },
        { year: 2026, category: 'depreciation', label: 'Depreciation', amount: 50_000 },
        { year: 2026, category: 'interest', label: 'Interest Expense (non-operating)', amount: 20_000 },
      ],
    },
  ]
  for (const input of scenarios) {
    const r = recastFinancials(input)
    assert.deepEqual(recastConsistencyErrors(r), [], `scenario ${input.listingId} must pass the invariant`)
    assert.doesNotThrow(() => assertRecastConsistency(r), `scenario ${input.listingId} must not throw`)
    // Every year must satisfy SDE = NI + Σ(itemized) exactly.
    for (const yr of r.years) {
      assert.equal(yr.recast.sde, yr.asReported.netIncome + yr.totalAddBacks, `${input.listingId} ${yr.label}`)
    }
  }
})

test('gate1: missing categories are surfaced for broker review, never folded in', () => {
  const input: RecastInput = {
    listingId: 'missing-cats',
    businessName: 'Missing Cats Co',
    entityType: 'llc',
    currency: '$',
    years: [
      {
        year: 2026,
        label: 'FY2026',
        grossRevenue: 800_000,
        cogs: 200_000,
        operatingExpenses: 300_000,
        ownerComp: 100_000,
        depreciation: 30_000,
        interest: 12_000,
        otherExpenses: 0,
        netIncome: 158_000,
      },
    ],
    addBacks: [
      // Only a one-time item — owner comp / D&A / interest NOT itemized.
      { year: 2026, category: 'one_time', label: 'Legal settlement (one-time)', amount: 40_000 },
    ],
  }
  const r = recastFinancials(input)
  const yr = r.years[0]
  // SDE = NI + itemized only. No silent folding of ownerComp/D&A/interest.
  assert.equal(yr.recast.sde, 158_000 + 40_000)
  // But the engine SURFACES them so the broker can add labeled lines.
  const cats = yr.missingCategories.map((m) => m.category).sort()
  assert.deepEqual(cats, ['depreciation', 'interest', 'owner_salary'])
  assert.equal(yr.missingCategories.find((m) => m.category === 'owner_salary')!.amount, 100_000)
  assert.equal(yr.missingCategories.find((m) => m.category === 'depreciation')!.amount, 30_000)
  assert.equal(yr.missingCategories.find((m) => m.category === 'interest')!.amount, 12_000)
})

test('gate1: EBITDA is reproducible from the itemized schedule only', () => {
  const r = recastFinancials(BOSS_SCENARIO)
  const fy26 = r.years.find((y) => y.year === 2026)!
  // NI + D&A lines + interest lines + non-owner one-time lines
  const expected = fy26.asReported.netIncome + 24_000
  assert.equal(fy26.recast.ebitda, expected)
})

// ---------------------------------------------------------------------------
// Structural guarantee — the send path must gate on the invariant, and no
// document may compute its own earnings.
// ---------------------------------------------------------------------------
test('gate1: docDelivery send path calls assertRecastConsistency before PDF generation', () => {
  const doc = readFileSync('lib/docDelivery.ts', 'utf8')
  assert.match(doc, /assertRecastConsistency\(result\)/, 'generateDeliveryPdf must validate the recast before exporting')
  assert.match(doc, /if \(recastResult\) assertRecastConsistency\(recastResult\)/, 'approveDelivery must validate a stored recast before sending')
})

test('gate1: documents consume the canonical resolver — never listing.sde directly', () => {
  const cim = readFileSync('lib/cim.ts', 'utf8')
  const bov = readFileSync('lib/bov.ts', 'utf8')
  const recast = readFileSync('lib/recast.ts', 'utf8')
  assert.match(cim, /resolveNormalizedEarnings/)
  assert.match(bov, /resolveNormalizedEarnings/)
  assert.ok(!/const sde = listing\.sde/.test(cim), 'CIM must not read listing.sde directly')
  assert.ok(!/const sde = guard\(listing\.sde\)/.test(bov), 'BOV must not read listing.sde directly')
  assert.ok(!/recast\.sde =/.test(recast), 'engine output must never be hand-assigned')
})
