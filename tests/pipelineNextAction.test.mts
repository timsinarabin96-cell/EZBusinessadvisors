import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/pipeline.ts', 'utf8')
const card = readFileSync('components/deals/DealCard.tsx', 'utf8')

// ---------------------------------------------------------------------------
// Structure: next best action helper + card chip
// ---------------------------------------------------------------------------

test('pipeline: nextBestAction exists with stage actions + staleness thresholds', () => {
  assert.match(lib, /export function nextBestAction/)
  assert.match(lib, /STAGE_ACTIONS/)
  assert.match(lib, /letter_of_intent/)
  assert.match(lib, /under_contract/)
  assert.match(lib, /due_diligence/)
  assert.match(lib, /closing/)
  assert.match(lib, /closed/)
  assert.match(lib, /export function daysInStage/)
})

test('nextBestAction: fresh vs stale branches — fresh navy, stale amber, LOI messages', () => {
  assert.match(lib, /stale\s*\?\s*\{ label: cfg\.stale, tone: 'amber' \}/)
  assert.match(lib, /tone: deal\.status === 'closed' \? 'green' : 'navy'/)
  assert.match(lib, /'LOI stuck — call the seller'/)
  assert.match(lib, /'Follow up on LOI'/)
  assert.match(lib, /'Collect testimonial & referral'/)
  assert.match(lib, /days >= cfg\.staleDays/)
})

test('daysInStage: defaults to 0 when no date is present', () => {
  assert.match(lib, /if \(!ref\) return 0/)
  assert.match(lib, /Number\.isFinite\(days\) && days > 0 \? days : 0/)
})

test('pipeline: card renders the next best action chip with tone colors', () => {
  assert.match(card, /nextBestAction\(deal\)/)
  assert.match(card, /actionColors/)
  assert.match(card, /action\.tone === 'amber' \? '⚠️' : '➜'/)
  assert.match(card, /action\.label/)
  assert.match(card, /borderRadius: 999, padding: '3px 10px'/)
})
