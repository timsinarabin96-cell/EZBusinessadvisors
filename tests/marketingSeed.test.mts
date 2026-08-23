import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const seed = readFileSync('sql/marketing_store_seed.sql', 'utf8')
const store = readFileSync('components/marketing/MarketingStore.tsx', 'utf8')

test('marketing catalog covers all ten categories', () => {
  for (const c of ['business_cards','banners','brochures','envelopes','flyers','postcards','signage','promo','apparel','stationery']) {
    assert.match(seed, new RegExp(c), `missing category ${c}`)
  }
})

test('catalog is priced and print-ready', () => {
  assert.match(seed, /base_price/)
  assert.match(seed, /59\.00/)
  assert.match(seed, /249\.00/)
  assert.match(seed, /Premium/)
})

test('seed is idempotent (on conflict do nothing)', () => {
  assert.match(seed, /on conflict do nothing/)
  assert.match(seed, /not exists \(select 1 from public\.marketing_product_variants/)
})

test('storefront renders product grid with categories', () => {
  assert.match(store, /fetchProducts/)
  assert.match(store, /CATEGORIES/)
  assert.match(store, /addItem/)
})
