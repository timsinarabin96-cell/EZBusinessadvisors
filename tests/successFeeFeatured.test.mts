import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('success fee tiers: 3% up to $1M, 2% $1M–2M, 1% above $2M', () => {
  const lib = readFileSync('lib/successFee.ts', 'utf8')
  assert.match(lib, /calculateSuccessFee/)
  assert.match(lib, /rate: 0.03/)
  assert.match(lib, /rate: 0.02/)
  assert.match(lib, /rate: 0.01/)
  assert.match(lib, /recordSuccessFee/)
  assert.match(lib, /deal_success_fees/)
})

test('success fee schema has fee table + platform stats view', () => {
  const schema = readFileSync('sql/success_fee_schema.sql', 'utf8')
  assert.match(schema, /deal_success_fees/)
  assert.match(schema, /fee_cents/)
  assert.match(schema, /platform_success_fee_stats/)
  assert.match(schema, /unique \(listing_id, deal_id\)/)
})

test('closing milestone completion triggers success fee recording', () => {
  const route = readFileSync('app/api/closing/route.ts', 'utf8')
  assert.match(route, /recordSuccessFee/)
  assert.match(route, /category === 'closing'/)
  assert.match(route, /Auto-recorded when closing milestone completed/)
})

test('featured slot options exist with pricing', () => {
  const lib = readFileSync('lib/featuredSlots.ts', 'utf8')
  assert.match(lib, /FEATURED_SLOT_OPTIONS/)
  assert.match(lib, /priceCents: 14900/)
  assert.match(lib, /priceCents: 34900/)
  assert.match(lib, /priceCents: 49900/)
  assert.match(lib, /activateFeaturedSlot/)
})

test('featured slots schema has is_featured + featured_until + expiry', () => {
  const schema = readFileSync('sql/featured_slots_schema.sql', 'utf8')
  assert.match(schema, /featured_slots/)
  assert.match(schema, /is_featured boolean/)
  assert.match(schema, /featured_until timestamptz/)
  assert.match(schema, /expire_featured_slots/)
})

test('stripe checkout supports featured product', () => {
  const route = readFileSync('app/api/stripe/checkout/route.ts', 'utf8')
  assert.match(route, /product === 'featured'/)
  assert.match(route, /FEATURED_SLOT_OPTIONS/)
})

test('stripe webhook confirms featured slots', () => {
  const route = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
  assert.match(route, /kind === 'featured'/)
  assert.match(route, /confirmFeaturedSlot/)
})

test('featured purchase UI exists on the listing edit page', () => {
  const page = readFileSync('app/dashboard/listings/[id]/edit/page.tsx', 'utf8')
  assert.match(page, /FeaturedSlotCard/)
  const card = readFileSync('components/listing/FeaturedSlotCard.tsx', 'utf8')
  assert.match(card, /Feature this listing/)
  assert.match(card, /FEATURED_SLOT_OPTIONS/)
})

test('platform admin overview includes success fees + featured + buyer passes', () => {
  const lib = readFileSync('lib/platform.ts', 'utf8')
  assert.match(lib, /successFees/)
  assert.match(lib, /platform_success_fee_stats/)
  assert.match(lib, /featured/)
  assert.match(lib, /buyer_subscriptions/)
})
