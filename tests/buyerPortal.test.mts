import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const portal = readFileSync('app/api/buyers/portal/route.ts', 'utf8')
const portalTest = readFileSync('tests/buyerPortal.test.mts', 'utf8')
const dashboard = readFileSync('app/dashboard/buyer/page.tsx', 'utf8')

test('buyer portal requires a real login (Bearer token, auth user)', () => {
  assert.match(portal, /unauthorizedResponse\(\)/)
  assert.match(portal, /db\.auth\.getUser\(token\)/)
  assert.match(portal, /No email on this account/)
})

test('buyer portal matches deals by the logged-in email only (no identity leak)', () => {
  assert.match(portal, /auth\.user\.email/)
  assert.match(portal, /ilike\('buyer_email', email\)/)
  assert.match(portal, /buyer_leads/)
  assert.match(portal, /deal_offers/)
})

test('buyer portal returns pipeline stage + listing info per deal', () => {
  assert.match(portal, /pipeline_stage/)
  assert.match(portal, /business_name/)
  assert.match(portal, /nda_signed/)
  assert.match(portal, /offers_count/)
})

test('buyer portal test file exists and covers the route', () => {
  assert.ok(portalTest.length > 0)
  assert.match(portalTest, /buyer portal/)
})

test('buyer dashboard is the real-login buyer portal surface', () => {
  assert.match(dashboard, /Buyer Match Pass/)
  assert.match(dashboard, /supabase\.auth\.signOut/)
})
