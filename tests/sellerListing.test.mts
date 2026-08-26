import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/sellerListing.ts', 'utf8')
const route = readFileSync('app/api/marketplace/seller-order/route.ts', 'utf8')
const sellPage = readFileSync('app/(public)/marketplace/sell/page.tsx', 'utf8')

test('seller order service creates draft listing + paid order', () => {
  assert.match(lib, /createSellerListingOrder/)
  assert.match(lib, /seller_listing_orders/)
  assert.match(lib, /from\('listings'\)\s*\.insert/)
  assert.match(lib, /status: 'draft'/)
})

test('seller listings never publish automatically — broker review required', () => {
  assert.match(lib, /broker_only/)
  assert.match(lib, /compliance_status: 'pending'/)
  assert.match(lib, /awaiting broker review/)
  assert.match(lib, /intake_source: 'seller_self_service'/)
})

test('order failure rolls back the draft listing', () => {
  assert.match(lib, /Roll back the listing/)
  assert.match(lib, /from\('listings'\)\.delete\(\)\.eq\('id', listing\.id\)/)
})

test('seller order API validates plans and requires a brokerage', () => {
  assert.match(route, /z\.enum\(\['free', 'professional', 'enterprise'\]\)/)
  assert.match(route, /No receiving brokerage is configured yet/)
  assert.match(route, /sellerOrderSchema/)
})

test('sell page offers paid plans and submits real orders', () => {
  assert.match(sellPage, /submitSellerListingOrder/)
  assert.match(sellPage, /setPlanId\(plan\.id\)/)
  assert.match(sellPage, /Listing order created/)
})

test('plans exist with the new monthly model', () => {
  // Owner plans + upsells now live in the single source of truth (pricing.ts).
  const pricing = readFileSync('lib/pricing.ts', 'utf8')
  assert.match(pricing, /Free Listing/)
  assert.match(pricing, /per listing \/ month/)
  assert.match(pricing, /LISTING_UPSELL_OPTIONS/)
  assert.match(pricing, /CRM_MONTHLY = 499/)
  assert.match(pricing, /featured_30/)
  // Brokerage SaaS plans remain in listingIntelligence.
  const intel = readFileSync('lib/listingIntelligence.ts', 'utf8')
  assert.match(intel, /Enterprise Network/)
  assert.match(intel, /monthly: 499/)
  assert.match(intel, /OWNER_LISTING_PLANS.*from '@\/lib\/pricing'/)
})
