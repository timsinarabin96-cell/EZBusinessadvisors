import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeBuyerProfilePatch, describeBuyerCriteria } from '../lib/buyerProfileCore.ts'

test('sanitizeBuyerProfilePatch whitelists known fields and drops unknown keys', () => {
  const patch = sanitizeBuyerProfilePatch({
    industries: ['Home Care', '  Restaurants ', ''],
    locations: ['FL', '  TX'],
    min_price: 150000,
    max_price: 'not-a-number',
    notification_email: true,
    ai_match_enabled: 'false',
    hacked_field: 'evil',
    min_sde: null,
  })
  assert.deepEqual(patch.industries, ['Home Care', 'Restaurants'])
  assert.deepEqual(patch.locations, ['FL', 'TX'])
  assert.equal(patch.min_price, 150000)
  assert.equal(patch.max_price, undefined) // dropped — not a finite number
  assert.equal(patch.notification_email, true)
  assert.equal(patch.ai_match_enabled, true) // coerced
  assert.equal(patch.min_sde, null) // null clears
  assert.ok(!('hacked_field' in patch))
})

test('sanitizeBuyerProfilePatch normalizes arrays, strings, and booleans', () => {
  const patch = sanitizeBuyerProfilePatch({
    industries: 'not-an-array',
    financing_methods: ['SBA', 7, null],
    name: '  Acme Capital  ',
    timeline: null,
    notification_sms: 1,
    active: 0,
    available_cash: 250000.5,
  })
  assert.deepEqual(patch.industries, []) // non-array → []
  assert.deepEqual(patch.financing_methods, ['SBA', '7']) // coerced strings, null dropped
  assert.equal(patch.name, 'Acme Capital')
  assert.equal(patch.timeline, null)
  assert.equal(patch.notification_sms, true)
  assert.equal(patch.active, false)
  assert.equal(patch.available_cash, 250000.5)
})

test('sanitizeBuyerProfilePatch ignores undefined values and rejects Infinity/NaN', () => {
  const patch = sanitizeBuyerProfilePatch({
    min_price: Infinity,
    max_price: NaN,
    min_revenue: undefined,
    owner_involvement: '  Full-time  ',
  })
  assert.equal(patch.min_price, undefined)
  assert.equal(patch.max_price, undefined)
  assert.equal(patch.min_revenue, undefined)
  assert.equal(patch.owner_involvement, 'Full-time')
})

test('describeBuyerCriteria summarizes the profile in plain language', () => {
  assert.equal(describeBuyerCriteria({}), 'Open to all businesses')
  assert.equal(
    describeBuyerCriteria({ industries: ['Home Care'], locations: ['FL'], min_price: 100000, max_price: 2000000, min_sde: 75000 }),
    'Industries: Home Care · Locations: FL · Price $100,000–$2,000,000 · Min SDE $75,000',
  )
  assert.equal(describeBuyerCriteria({ max_price: 500000 }), 'Price up to $500,000')
  assert.equal(describeBuyerCriteria({ min_price: 250000 }), 'Price from $250,000')
})
