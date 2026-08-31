/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// #2 seller tiers + #8 advance-to-listing regression tests (spec 08-31).
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'

const {
  SELLER_TIER_DEFAULTS,
  tierFromPlanId,
  tierAllowsAiIntake,
  tierAllowsFinancialDocuments,
  trustLabelForTier,
  tierOfListing,
} = await import('../lib/sellerTiers.ts')
const { buildAdvanceFields } = await import('../lib/advanceToListing.ts')
const { recastFinancials } = await import('../lib/recast.ts')

const sql = readFileSync('sql/seller_tiers_2026_08_31.sql', 'utf8')
const sellerListing = readFileSync('lib/sellerListing.ts', 'utf8')
const advisorRoute = readFileSync('app/api/advisor/interview/route.ts', 'utf8')
const advanceRoute = readFileSync('app/api/listings/advance/route.ts', 'utf8')

// A valid recast (passes the reconciliation invariant).
function validRecast() {
  return recastFinancials({
    listingId: 'advance-test',
    businessName: 'Advance Test Co',
    entityType: 'llc',
    currency: '$',
    years: [
      { year: 2026, label: 'FY2026', grossRevenue: 1_000_000, cogs: 300_000, operatingExpenses: 250_000, ownerComp: 142_000, depreciation: 24_000, interest: 0, otherExpenses: 0, netIncome: 284_000 },
    ],
    addBacks: [
      { id: 'a1', category: 'owner_salary', description: 'Owner Salary', amount: 142_000, recurring: true, year: 2026 },
      { id: 'a2', category: 'depreciation', description: 'Depreciation', amount: 24_000, recurring: true, year: 2026 },
    ],
  })
}

test('tiers: free = manual-only / Self-Reported; paid = full AI / AI-Verified', () => {
  assert.equal(SELLER_TIER_DEFAULTS.free.aiIntake, false)
  assert.equal(SELLER_TIER_DEFAULTS.free.financialDocuments, false)
  assert.equal(SELLER_TIER_DEFAULTS.free.trustLabel, 'Self-Reported')
  assert.equal(SELLER_TIER_DEFAULTS.paid.aiIntake, true)
  assert.equal(SELLER_TIER_DEFAULTS.paid.financialDocuments, true)
  assert.equal(SELLER_TIER_DEFAULTS.paid.trustLabel, 'AI-Verified Financials')
  // Paid tier price default is a sensible non-zero one-time fee.
  assert.ok(SELLER_TIER_DEFAULTS.paid.priceUsd > 0)
})

test('tiers: plan mapping — free stays free, professional/enterprise → paid', () => {
  assert.equal(tierFromPlanId('free'), 'free')
  assert.equal(tierFromPlanId('professional'), 'paid')
  assert.equal(tierFromPlanId('enterprise'), 'paid')
  assert.equal(tierFromPlanId(null), 'free')
})

test('tiers: helpers + listing row resolution', () => {
  assert.equal(tierAllowsAiIntake('free'), false)
  assert.equal(tierAllowsAiIntake('paid'), true)
  assert.equal(tierAllowsFinancialDocuments('free'), false)
  assert.equal(tierAllowsFinancialDocuments('paid'), true)
  assert.equal(trustLabelForTier('free'), 'Self-Reported')
  assert.equal(trustLabelForTier('paid'), 'AI-Verified Financials')
  assert.equal(tierOfListing({ seller_tier: 'paid' }), 'paid')
  assert.equal(tierOfListing({ seller_tier: 'free' }), 'free')
  assert.equal(tierOfListing(null), 'free')
})

test('tiers: SQL adds seller_tier + tier_paid_at, idempotent, constrained', () => {
  assert.match(sql, /add column if not exists seller_tier text not null default 'free'/)
  assert.match(sql, /add column if not exists tier_paid_at timestamptz/)
  assert.match(sql, /check \(seller_tier in \('free', 'paid'\)\)/)
  assert.match(sql, /begin;|commit;/)
})

test('tiers: seller order stamps tier onto the listing at creation', () => {
  assert.match(sellerListing, /tierFromPlanId\(planId\)/)
  assert.match(sellerListing, /seller_tier: sellerTier/)
  assert.match(sellerListing, /tier_paid_at: tierNow/)
})

test('tiers: advisor interview route gates free tier to manual path', () => {
  assert.match(advisorRoute, /tierAllowsAiIntake\(tier\)/)
  assert.match(advisorRoute, /Free listings use the manual form/)
  assert.match(advisorRoute, /manual_path/)
})

test('advance: paid tier copies validated recast figures + trust label', () => {
  const r = validRecast()
  const out = buildAdvanceFields({
    listingId: 'l1',
    businessName: 'Advance Test Co',
    tier: 'paid',
    recast: r,
    bov: { askingPriceSuggestion: 950_000, valuationRange: '$800,000 – $1,200,000' },
    cim: { narrative: 'Established home care agency with recurring clientele.' },
    interviewDraft: { industry: 'Home Care', reason_for_sale: 'Retirement' },
  })
  assert.equal(out.ok, true)
  assert.equal(out.trustLabel, 'AI-Verified Financials')
  assert.equal(out.fields!.sde, 450_000) // 284k + 142k + 24k itemized
  assert.equal(out.fields!.ebitda, 308_000) // 284k + 24k D&A line
  assert.equal(out.fields!.annual_revenue, 1_000_000)
  assert.equal(out.fields!.asking_price, 950_000)
  assert.equal(out.fields!.industry, 'Home Care')
})

test('advance: free tier → manual-only, no AI figures, Self-Reported label', () => {
  const out = buildAdvanceFields({
    listingId: 'l2',
    businessName: 'Manual Co',
    tier: 'free',
    recast: null,
  })
  assert.equal(out.ok, true)
  assert.equal(out.trustLabel, 'Self-Reported')
  assert.equal(out.fields!.ai_advance_source, 'manual')
})

test('advance: no recast on paid tier → blocked, never estimated', () => {
  const out = buildAdvanceFields({ listingId: 'l3', businessName: 'X', tier: 'paid', recast: null })
  assert.equal(out.ok, false)
  assert.equal(out.blocked, true)
  assert.match(out.error!, /validated recast/)
})

test('advance: inconsistent recast → refused (reconciliation invariant holds)', () => {
  const r = validRecast()
  // Tamper SDE to break the invariant.
  ;(r.years[0].recast as { sde: number }).sde = r.years[0].recast.sde + 50_000
  const out = buildAdvanceFields({ listingId: 'l4', businessName: 'X', tier: 'paid', recast: r })
  assert.equal(out.ok, false)
  assert.equal(out.blocked, true)
  assert.match(out.error!, /Reconciliation invariant failed/)
})

test('advance: API route is auth + agency gated and stamps trust label', () => {
  assert.match(advanceRoute, /authenticateProfileRequest/)
  assert.match(advanceRoute, /canManageAgency/)
  assert.match(advanceRoute, /buildAdvanceFields/)
  assert.match(advanceRoute, /trust_label/)
  assert.match(advanceRoute, /ai_advance_at/)
})
