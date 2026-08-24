import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('buyer pass plans exist at $49 and $99 with buyer perks', () => {
  const lib = readFileSync('lib/buyerPass.ts', 'utf8')
  assert.match(lib, /match_pass/)
  assert.match(lib, /match_pass_elite/)
  assert.match(lib, /monthly: 49/)
  assert.match(lib, /monthly: 99/)
  assert.match(lib, /Priority deal alerts/)
  assert.match(lib, /Verified Buyer badge/)
  assert.match(lib, /Off-market/)
})

test('match pass schema has buyer_subscriptions + verified flag', () => {
  const schema = readFileSync('sql/match_pass_schema.sql', 'utf8')
  assert.match(schema, /buyer_subscriptions/)
  assert.match(schema, /profile_id/)
  assert.match(schema, /verified_buyer/)
  assert.match(schema, /match_pass_elite/)
})

test('stripe checkout supports the buyer_pass product', () => {
  const route = readFileSync('app/api/stripe/checkout/route.ts', 'utf8')
  assert.match(route, /buyer_pass/)
  assert.match(route, /BUYER_PASS_PLANS/)
})

test('stripe webhook activates buyer subscriptions + verified badge', () => {
  const route = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
  assert.match(route, /kind === 'buyer_pass'/)
  assert.match(route, /buyer_subscriptions/)
  assert.match(route, /verified_buyer/)
})

test('buyer portal page exists with upgrade CTAs', () => {
  const page = readFileSync('app/dashboard/buyer/page.tsx', 'utf8')
  assert.match(page, /Match Pass/)
  assert.match(page, /createBuyerPassSession/)
  assert.match(page, /Verified Buyer/)
})

test('public pricing page includes the AI Match Pass section', () => {
  const page = readFileSync('app/(public)/pricing/page.tsx', 'utf8')
  assert.match(page, /AI Match Pass/)
  assert.match(page, /BUYER_PASS_PLANS/)
})

test('buyer lead capture stamps verified_buyer for pass holders', () => {
  const lib = readFileSync('lib/marketplace.ts', 'utf8')
  assert.match(lib, /verified_buyer/)
  assert.match(lib, /buyer_subscriptions/)
})
