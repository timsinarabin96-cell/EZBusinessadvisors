import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const publish = readFileSync('lib/publish.ts', 'utf8')

// ---------------------------------------------------------------------------
// Preventative AI risk gate — publish.ts must score every new listing and
// auto-flag critical risk before it can sit in the marketplace unflagged.
// ---------------------------------------------------------------------------

test('publish.ts: imports the scam risk scorer', () => {
  assert.match(publish, /assessListingRisk/)
  assert.match(publish, /from ['"]@\/lib\/scamDetectionCore['"]/)
})

test('publish.ts: auto-flags critical risk on publish', () => {
  assert.match(publish, /risk\.score >= 75/)
  assert.match(publish, /flagged: true, flag_reasons:/)
  assert.match(publish, /AI: \$\{risk\.score\}\/100/)
})

test('publish.ts: risk gate never hard-fails a publish', () => {
  assert.match(publish, /never hard-fail a publish/)
  assert.match(publish, /catch \{\s*risk = null/)
  assert.match(publish, /assessLegitimacy/)
  assert.match(publish, /from ['"]@\/lib\/listingLegitimacy['"]/)
})

test('publish.ts: returns the risk report in the publish response', () => {
  assert.match(publish, /risk: risk \? \{ score: risk\.score, level: risk\.level, reasons: risk\.reasons \} : null/)
})

test('publish.ts: scorer inputs include owner account age (instant-publish check)', () => {
  assert.match(publish, /ownerCreatedAt: owner\?\.created_at/)
  assert.match(publish, /svc\.from\('profiles'\)\.select\('created_at'\)/)
})

test('publish.ts: readiness low-flag path still works alongside AI gate', () => {
  assert.match(publish, /const flagged = readiness\.score < PUBLISH_READINESS_MIN/)
})
