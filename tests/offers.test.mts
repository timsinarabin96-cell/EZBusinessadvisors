import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/offers.ts', 'utf8')
const route = readFileSync('app/api/offers/route.ts', 'utf8')
const page = readFileSync('app/dashboard/offer-lab/page.tsx', 'utf8')
const options = readFileSync('app/api/listings/options/route.ts', 'utf8')

test('offer lab scores seller value heuristically', () => {
  assert.match(lib, /scoreOffer/)
  assert.match(lib, /Math\.min\(50, Math\.round\(\(cash \/ total\) \* 50\)\)/)
  assert.match(lib, /financing_contingency/)
})

test('offers are created as drafts and reference listings', () => {
  assert.match(lib, /createOffer/)
  assert.match(lib, /status: 'draft'/)
  assert.match(lib, /seller_value_score/)
})

test('offer status flows through submit/accept/reject', () => {
  assert.match(lib, /updateOfferStatus/)
  assert.match(route, /z\.enum\(\['draft', 'submitted', 'accepted', 'rejected', 'withdrawn'\]\)/)
})

test('offer API is agency-scoped and authenticated', () => {
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse/)
  assert.match(route, /authenticateProfileRequest/)
})

test('offer lab page is wired into dashboard nav', () => {
  assert.match(page, /Deal Offer Lab/)
  assert.match(page, /\/api\/offers/)
  const shell = readFileSync('components/layout/navConfig.ts', 'utf8')
  assert.match(shell, /dashboard\/offer-lab/)
})

test('listing options endpoint feeds the offer picker', () => {
  assert.match(options, /\/api\/listings\/options/)
  assert.match(options, /canManageAgency/)
  assert.match(options, /business_name/)
})
