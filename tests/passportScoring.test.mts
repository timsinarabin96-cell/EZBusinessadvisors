import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const scoring = readFileSync('lib/passportScoring.ts', 'utf8')
const route = readFileSync('app/api/intelligence/passports/route.ts', 'utf8')

test('passport scoring includes documents, financing, liquidity, and risk signals', () => {
  for (const signal of ['documentationScore', 'verificationScore', 'financingScore', 'liquidityScore', 'riskFlags', 'readinessActions']) assert.match(scoring, new RegExp(signal))
})

test('passport creation authenticates and enforces agency membership', () => {
  assert.match(route, /authenticateProfileRequest\(req\)/)
  assert.match(route, /authenticated\.memberships\.some/)
  assert.match(route, /membership\.agency_id === listing\.agency_id/)
})

test('passport facts begin seller-stated and cannot be publicly disclosed automatically', () => {
  assert.match(scoring, /verification_level: 'seller_stated'/)
  assert.match(scoring, /public_disclosure_allowed: false/)
  assert.doesNotMatch(route, /verification_level:\s*'document_verified'/)
})
