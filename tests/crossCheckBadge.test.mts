/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// #5/#11 — upload cross-check regression tests (spec §4): every uploaded
// document is checked for correct type, entity/business-name match, missing
// signature, wrong dates — flagged to the agent on upload, never silently
// accepted or rejected. Also locks the badge (#3) + tier (#2) UI wiring.
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const analyzer = readFileSync('lib/ai/documentAnalyzer.ts', 'utf8')
const types = readFileSync('lib/ai/types.ts', 'utf8')
const intelRoute = readFileSync('app/api/financial/intelligence/route.ts', 'utf8')
const importRoute = readFileSync('app/api/listings/financial-import/route.ts', 'utf8')
const card = readFileSync('components/public/PublicListingCard.tsx', 'utf8')
const detail = readFileSync('components/public/ListingDetailInteractive.tsx', 'utf8')

test('crosscheck: DocumentAnalysis carries the crossCheck verdict type', () => {
  assert.match(types, /export interface DocumentCrossCheck/)
  assert.match(types, /entityMatch: 'match' \| 'mismatch' \| 'unknown'/)
  assert.match(types, /signature: 'present' \| 'missing' \| 'n\/a'/)
  assert.match(types, /flags: \{ severity: 'info' \| 'warning' \| 'critical'; issue: string \}\[\]/)
  assert.match(types, /crossCheck: DocumentCrossCheck/)
})

test('crosscheck: Claude prompt asks for entity/signature/date verdict + flags', () => {
  assert.match(analyzer, /crossCheck/)
  assert.match(analyzer, /entityMatch/)
  assert.match(analyzer, /"mismatch" when a DIFFERENT entity is clearly stated/)
  assert.match(analyzer, /signature: "present"\/"missing" for docs that should be signed/)
  assert.match(analyzer, /periodCovered/)
  assert.match(analyzer, /The broker sees these on upload/)
})

test('crosscheck: normalizer backstops placeholder entity names as warnings', () => {
  assert.match(analyzer, /normalizeCrossCheck/)
  assert.match(analyzer, /Placeholder\/sample entity name detected/)
  assert.match(analyzer, /severity: 'warning'/)
})

test('crosscheck: no-parseable-text fallbacks carry a crossCheck verdict, not a silent pass', () => {
  assert.match(intelRoute, /crossCheck: \{ entityName: null, entityMatch: 'unknown'/)
  assert.match(intelRoute, /cross-check skipped/i)
  assert.match(importRoute, /crossCheck: \{ entityName: null, entityMatch: 'unknown'/)
})

test('badge: trust label renders on the public card + detail view (#3)', () => {
  assert.match(card, /trust_label === 'AI-Verified Financials'/)
  assert.match(card, /trust_label === 'Self-Reported'/)
  assert.match(detail, /trust_label === 'AI-Verified Financials'/)
  assert.match(detail, /trust_label === 'Self-Reported'/)
})
