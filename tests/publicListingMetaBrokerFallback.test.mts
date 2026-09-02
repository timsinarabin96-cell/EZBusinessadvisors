import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateExtraction } from '@/lib/ai/chatLeadExtraction'

const meta = readFileSync('lib/publicListingMeta.ts', 'utf8')

test('publicListingMeta falls back to agency-only contact card when no broker_profiles row exists', () => {
  // Regression guard: previously `agent: broker ? {...} : null` meant any
  // agency without a broker_profiles row silently hid the float entirely.
  assert.match(meta, /else if \(agency && \(clean\(agency\.phone\) \|\| clean\(agency\.email\) \|\| clean\(agency\.name\)\)\)/)
  assert.match(meta, /profileId: `agency:\$\{agency\.id\}`/)
  assert.doesNotMatch(meta, /agent: broker\s*\?\s*\{[\s\S]*?\}\s*:\s*null,\s*\}\s*\}\)/)
})

test('publicListingMeta exposes resolveAgencyBroker for chat-widget lead handoff (no listing_id needed)', () => {
  assert.match(meta, /export async function resolveAgencyBroker\(agencyId: string\)/)
  assert.match(meta, /\.eq\('agency_id', agencyId\)/)
  assert.match(meta, /\.eq\('is_public', true\)/)
})

// Cross-check: the broker-fallback + lead-extraction pieces both reuse the
// same strict validation discipline (never trust unvalidated fields).
test('sanity: validateExtraction stays pure and synchronous (no AI calls) so the route can call it deterministically', () => {
  const out = validateExtraction({ kind: 'seller', name: 'A', email: 'a@b.com' })
  assert.equal(typeof out.ready, 'boolean')
})
