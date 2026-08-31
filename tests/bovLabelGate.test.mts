/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// BOV liability label gate (boss 08-31 — HIGHEST PRIORITY).
// A document may only title itself "Broker Opinion of Value" when
// bov_versions.status = 'final' AND a licensed agent signed off
// (reviewed_by + reviewed_at). Everything else — draft, review, or
// agent-untouched (including ALL self-serve paid-tier output) — must title
// itself "AI Valuation Estimate".
//
// Invariant locks:
//  1. The label resolves through ONE helper (bovDocumentLabel) — no hardcoded
//     "Broker Opinion of Value" literals at any generation/export site.
//  2. Default generation is ALWAYS draft → "AI Valuation Estimate".
//  3. finalizeVersion refuses to flip to 'final' without a reviewer id.
//  4. The finalize route is agency-gated and records reviewed_by/reviewed_at.
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Dummy env so the supabase client import inside lib/bov.ts doesn't blow up.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'

const { bovDocumentLabel, bovDocumentTitle, bovLabelFromTitle, generateBovContent } = await import('@/lib/bov')

const bovLib = readFileSync('lib/bov.ts', 'utf8')
const pdfExport = readFileSync('lib/pdfExport.ts', 'utf8')
const autoGenerate = readFileSync('lib/autoGenerate.ts', 'utf8')
const docDelivery = readFileSync('lib/docDelivery.ts', 'utf8')
const workflow = readFileSync('lib/workflow.ts', 'utf8')
const finalizeRoute = readFileSync('app/api/financial/bov/finalize/route.ts', 'utf8')
const bovGenerator = readFileSync('components/bov/BovGenerator.tsx', 'utf8')

const FAKE_LISTING = {
  id: '00000000-0000-0000-0000-000000000001',
  business_name: 'Acme Services',
  industry: 'Commercial Services',
  asking_price: 500000,
  annual_revenue: 400000,
  sde: 120000,
  ebitda: 90000,
  location_general: 'Pennsylvania',
} as never

test('label helper: only "final" may be Broker Opinion of Value', () => {
  assert.equal(bovDocumentLabel('final'), 'Broker Opinion of Value')
  assert.equal(bovDocumentLabel('draft'), 'AI Valuation Estimate')
  assert.equal(bovDocumentLabel('review'), 'AI Valuation Estimate')
  assert.equal(bovDocumentLabel(null), 'AI Valuation Estimate')
  assert.equal(bovDocumentLabel(undefined), 'AI Valuation Estimate')
  assert.equal(bovDocumentLabel(''), 'AI Valuation Estimate')
})

test('document title helper threads the label', () => {
  assert.equal(bovDocumentTitle('Acme', 'final'), 'Acme — Broker Opinion of Value')
  assert.equal(bovDocumentTitle('Acme', 'draft'), 'Acme — AI Valuation Estimate')
  assert.equal(bovDocumentTitle(null, 'draft'), 'Business — AI Valuation Estimate')
  assert.equal(bovLabelFromTitle('Acme — Broker Opinion of Value'), 'Broker Opinion of Value')
  assert.equal(bovLabelFromTitle('Acme — AI Valuation Estimate'), 'AI Valuation Estimate')
})

test('default BOV generation is an AI Valuation Estimate (never BOV)', () => {
  const bov = generateBovContent(FAKE_LISTING)
  assert.ok(bov.title.endsWith('AI Valuation Estimate'))
  assert.ok(!bov.title.includes('Broker Opinion of Value'))
  assert.equal(bov.reviewState, 'draft')
})

test('only an explicit agent-final generation titles Broker Opinion of Value', () => {
  const bov = generateBovContent(FAKE_LISTING, { reviewState: 'final', reviewedBy: 'agent-1', reviewedAt: '2026-08-31T00:00:00Z' })
  assert.ok(bov.title.endsWith('Broker Opinion of Value'))
  assert.equal(bov.reviewState, 'final')
  assert.equal(bov.reviewedBy, 'agent-1')
})

test('self-serve paid tier never auto-labels BOV — pipeline output is an estimate', () => {
  // The one-click pipeline calls generateBovContent with no review state and
  // uses the generated title verbatim — so paid-tier auto output stays an
  // AI Valuation Estimate until an agent finalizes.
  assert.match(autoGenerate, /generateBovContent\(L, \{ recast \}\)/)
  assert.match(autoGenerate, /title: bov\.title/)
  assert.ok(!autoGenerate.includes('Broker Opinion of Value`'))
})

test('all 4 title sites resolve through the shared helper — no hardcoded literals', () => {
  // lib/pdfExport.ts (cover eyebrow), lib/autoGenerate.ts (artifact title),
  // lib/docDelivery.ts (delivery title + email kindLabel) — all must import
  // and use the helpers, never paste the label string.
  assert.match(pdfExport, /bovDocumentLabel\(content\.reviewState/)
  assert.ok(!pdfExport.includes("eyebrow: 'Broker Opinion of Value'"))
  assert.match(docDelivery, /bovDocumentTitle\(listing\.business_name/)
  assert.match(docDelivery, /bovLabelFromTitle\(delivery\.doc_title\)/)
  assert.ok(!docDelivery.includes("— Broker Opinion of Value`"))
  // lib/bov.ts itself owns the only literals (constants + helper).
  assert.match(bovLib, /export const BOV_LABEL_FINAL = 'Broker Opinion of Value'/)
  assert.match(bovLib, /export const BOV_LABEL_AI = 'AI Valuation Estimate'/)
})

test('finalizeVersion refuses to flip to final without a named reviewer', async () => {
  // Import fresh so we can inject a stub db.
  const { finalizeVersion } = await import('@/lib/workflow')
  let updated: Record<string, unknown> | null = null
  const stubDb = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        updated = patch
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }
      },
    }),
  }
  const noReviewer = await finalizeVersion('bov_versions', 'v1', 'final', { db: stubDb as never })
  assert.equal(noReviewer, false)
  assert.equal(updated, null)

  const withReviewer = await finalizeVersion('bov_versions', 'v1', 'final', { reviewerId: 'agent-1', db: stubDb as never })
  assert.equal(withReviewer, true)
  assert.equal(updated?.status, 'final')
  assert.equal(updated?.reviewed_by, 'agent-1')
  assert.ok(updated?.reviewed_at)
})

test('finalize route is agency-gated and records the reviewer trail', () => {
  assert.match(finalizeRoute, /versionId: z\.string\(\)\.uuid\(\)/)
  assert.match(finalizeRoute, /agency_members/)
  assert.match(finalizeRoute, /only a licensed agent may sign off a BOV/)
  assert.match(finalizeRoute, /finalizeVersion\('bov_versions', versionId, 'final', \{ reviewerId: user\.user\.id, db: supabase \}\)/)
  assert.match(finalizeRoute, /reviewed_by/)
  assert.match(finalizeRoute, /reviewed_at/)
})

test('agent review action is a real UI step (BOV generator)', () => {
  assert.match(bovGenerator, /Mark as Broker-Reviewed \(Final\)/)
  assert.match(bovGenerator, /api\/financial\/bov\/finalize/)
  assert.match(bovGenerator, /bovDocumentLabel\(versions\[0\]\.status\)/)
  assert.match(bovGenerator, /bovDocumentLabel\(content\.reviewState/)
})

test('SQL migration adds reviewer columns + hard invariant on final', () => {
  const sql = readFileSync('sql/bov_review_gate_2026_08_31.sql', 'utf8')
  assert.match(sql, /add column if not exists reviewed_by uuid references public\.profiles\(id\)/)
  assert.match(sql, /add column if not exists reviewed_at timestamptz/)
  assert.match(sql, /bov_final_requires_review/)
  assert.match(sql, /status <> 'final' or \(reviewed_by is not null and reviewed_at is not null\)/)
})

test('delivery title resolves the LIVE version status, never the tier', () => {
  assert.match(docDelivery, /await latestBovReviewState\(db, input\.listingId\)/)
  assert.match(docDelivery, /reviewState: db \? await latestBovReviewState\(db, listing\.id\) : 'draft'/)
  // No tier-based label anywhere in the delivery path.
  assert.ok(!docDelivery.includes('seller_tier'))
})
