/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// #4 configurable legal checklist regression tests (spec §2A / §5).
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const {
  DEFAULT_LEGAL_CHECKLIST,
  normalizeLegalChecklist,
  evaluateLegalChecklist,
  legalChecklistLabels,
} = await import('../lib/legalChecklist.ts')

const sql = readFileSync('sql/legal_checklist_2026_08_31.sql', 'utf8')
const publish = readFileSync('lib/publish.ts', 'utf8')

test('legal: default checklist = Marketing Agreement + LLC Resolution (every tier)', () => {
  assert.deepEqual(DEFAULT_LEGAL_CHECKLIST, ['marketing_agreement', 'llc_resolution'])
})

test('legal: normalize keeps known ids, drops junk, never zeroes the defaults', () => {
  assert.deepEqual(normalizeLegalChecklist(['marketing_agreement', 'llc_resolution', 'bogus']), ['marketing_agreement', 'llc_resolution'])
  // An empty / invalid list still keeps the two mandatory defaults (spec §5).
  assert.deepEqual(normalizeLegalChecklist(null), ['marketing_agreement', 'llc_resolution'])
  assert.deepEqual(normalizeLegalChecklist([]), ['marketing_agreement', 'llc_resolution'])
  // An agency may ADD documents but never REMOVE the mandatory two.
  assert.deepEqual(normalizeLegalChecklist(['llc_resolution']), ['marketing_agreement', 'llc_resolution'])
  assert.deepEqual(normalizeLegalChecklist(['marketing_agreement', 'corp_resolution', 'nda']), ['marketing_agreement', 'llc_resolution', 'corp_resolution', 'nda'])
})

test('legal: evaluate marks satisfied vs missing from uploaded + generated docs', () => {
  const res = evaluateLegalChecklist(
    ['marketing_agreement', 'llc_resolution', 'nda'],
    [
      { category: 'llc_resolution', body_text: null },
      { category: 'nda', body_text: 'signed' },
    ],
    [{ title: 'BrightPath Marketing Agreement' }],
  )
  assert.deepEqual(res.satisfied.sort(), ['llc_resolution', 'marketing_agreement', 'nda'])
  assert.deepEqual(res.missing, [])
})

test('legal: missing docs are reported for the gate block message', () => {
  const res = evaluateLegalChecklist(['marketing_agreement', 'llc_resolution'], [{ category: 'other', body_text: null }], [])
  assert.deepEqual(res.satisfied, [])
  assert.equal(res.missing.length, 2)
  assert.equal(legalChecklistLabels(res.missing).join(','), 'Marketing Agreement,LLC Resolution')
})

test('legal: SQL adds the configurable jsonb column with the spec default', () => {
  assert.match(sql, /add column if not exists legal_doc_checklist jsonb/)
  assert.match(sql, /default '\["marketing_agreement", "llc_resolution"\]'::jsonb/)
})

test('legal: publish gate enforces the agency-configured checklist, not hardcoded', () => {
  assert.match(publish, /evaluateLegalGateForListing/)
  assert.match(publish, /normalizeLegalChecklist/)
  assert.match(publish, /legal_doc_checklist/)
  assert.match(publish, /Legal gate:/)
  assert.match(publish, /LEGAL-DOC GATE \(#4, spec §5\)/)
})
