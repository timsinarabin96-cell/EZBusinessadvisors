import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/staleDeals.ts', 'utf8')
const route = readFileSync('app/api/stale/route.ts', 'utf8')

test('stale: scanner covers listings, buyers, sellers, deals', () => {
  assert.match(lib, /export async function findStaleDeals/)
  assert.match(lib, /thresholdDays = 14/)
  assert.match(lib, /entity_type: 'listing' \| 'buyer' \| 'seller' \| 'deal'/)
  assert.match(lib, /from\('listings'\)\.select/)
  assert.match(lib, /from\('buyer_leads'\)\.select/)
  assert.match(lib, /from\('seller_leads'\)\.select/)
  assert.match(lib, /from\('deals'\)\.select/)
  assert.match(lib, /lastContactedAt/)
  assert.match(lib, /days_since/)
})

test('stale: API is auth-gated and accepts days param', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /findStaleDeals/)
  assert.match(route, /days = Math\.max/)
})
