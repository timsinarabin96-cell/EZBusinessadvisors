import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/store_schema.sql', 'utf8')
const lib = readFileSync('lib/store.ts', 'utf8')
const page = readFileSync('app/dashboard/store/page.tsx', 'utf8')
const checkout = readFileSync('app/api/store/checkout/route.ts', 'utf8')
const workOrder = readFileSync('lib/storeWorkOrder.ts', 'utf8')

test('store catalog covers all ten categories', () => {
  for (const c of ['business_cards','banners','brochures','envelopes','flyers','postcards','signage','promo','apparel','stationery']) {
    assert.match(schema, new RegExp(c), `missing category ${c}`)
  }
})

test('store products carry cost + sell price so profit is computable', () => {
  assert.match(schema, /cost_price/)
  assert.match(schema, /sell_price/)
  assert.match(schema, /subtotal/)
  assert.match(schema, /cost_total/)
  assert.match(schema, /profit/)
  assert.match(schema, /59\.00/)
  assert.match(schema, /249\.00/)
  assert.match(schema, /on conflict do nothing/)
})

test('store orders track the full money path (sell, cost, profit, status)', () => {
  assert.match(schema, /create table if not exists public\.store_orders/)
  assert.match(schema, /unit_cost\s+numeric/)
  assert.match(schema, /unit_sell\s+numeric/)
  assert.match(schema, /status\s+text not null default 'paid'/)
  assert.match(schema, /work_order_ref/)
  assert.match(schema, /tracking_number/)
  assert.match(schema, /stripe_session_id/)
})

test('store lib exposes catalog, orders, stats and checkout helpers', () => {
  assert.match(lib, /fetchStoreProducts/)
  assert.match(lib, /fetchMyStoreOrders/)
  assert.match(lib, /fetchAllStoreOrders/)
  assert.match(lib, /fetchStoreStats/)
  assert.match(lib, /checkoutStoreOrder/)
  assert.match(lib, /STORE_CATEGORIES/)
})

test('storefront page renders catalog grid with an order flow', () => {
  assert.match(page, /Marketing Materials Store/)
  assert.match(page, /checkoutStoreOrder/)
  assert.match(page, /Ship To/)
  assert.match(page, /Secure Checkout/)
  assert.match(page, /fetchStoreProducts/)
})

test('checkout route authenticates and builds a Stripe session with profit metadata', () => {
  assert.match(checkout, /authenticateProfileRequest/)
  assert.match(checkout, /unauthorizedResponse/)
  assert.match(checkout, /createCheckoutSession/)
  assert.match(checkout, /kind: 'store_order'/)
  assert.match(checkout, /shippingAddress/)
})

test('work order dispatcher renders supplier email with order + ship-to details', () => {
  assert.match(workOrder, /WORK ORDER/)
  assert.match(workOrder, /workOrderRef/)
  assert.match(workOrder, /Ship To/)
  assert.match(workOrder, /supplier_email/)
  assert.match(workOrder, /sendEmail/)
})
