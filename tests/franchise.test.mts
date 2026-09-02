import assert from 'node:assert/strict'
import test from 'node:test'

// lib/franchise.ts is pure — safe to import directly.
const { formatInvestmentRange, formatRoyalty, franchiseSanityFlags, franchisePublishable, FRANCHISE_PRICE, FRANCHISE_PLAN_ID } = await import('../lib/franchise.ts')

test('franchise: flat $299/mo pricing constants', () => {
  assert.equal(FRANCHISE_PRICE, 299)
  assert.equal(FRANCHISE_PLAN_ID, 'franchise_monthly')
})

test('formatInvestmentRange: full range, one-sided, and hidden', () => {
  assert.equal(formatInvestmentRange(150000, 350000), '$150K – $350K')
  assert.equal(formatInvestmentRange(150000, null), 'From $150K')
  assert.equal(formatInvestmentRange(null, 350000), 'Up to $350K')
  assert.equal(formatInvestmentRange(1_500_000, 2_500_000), '$1.5M – $2.5M')
  assert.equal(formatInvestmentRange(null, null), 'Not disclosed')
})

test('formatRoyalty: percentage or not disclosed', () => {
  assert.equal(formatRoyalty(6), '6% of gross revenue')
  assert.equal(formatRoyalty(6.5), '6.5% of gross revenue')
  assert.equal(formatRoyalty(null), 'Not disclosed')
})

test('franchiseSanityFlags: flags missing fields, passes complete record', () => {
  const complete = {
    brand_name: 'FreshBites Kitchen',
    total_investment_min: 150000,
    total_investment_max: 350000,
    franchise_fee: 40000,
    royalty_fee_pct: 6,
    territories_available: 'Eastern PA, NJ',
    existing_units: 12,
    training_support: '4-week onboarding',
    ideal_candidate_liquid_capital: 100000,
    ideal_candidate_net_worth: 300000,
  }
  assert.deepEqual(franchiseSanityFlags(complete), [])

  const flags = franchiseSanityFlags({ brand_name: 'FreshBites' })
  assert.ok(flags.some((f) => f.includes('investment range')), 'missing investment range flagged')
  assert.ok(flags.some((f) => f.includes('Franchise fee')), 'missing franchise fee flagged')
  assert.ok(flags.some((f) => f.includes('Royalty fee')), 'missing royalty flagged')
  assert.ok(flags.some((f) => f.includes('Territories')), 'missing territories flagged')
  assert.ok(flags.some((f) => f.includes('existing units')), 'missing units flagged')
  assert.ok(flags.some((f) => f.includes('Training')), 'missing training flagged')
  assert.ok(flags.some((f) => f.includes('candidate financial profile')), 'missing candidate profile flagged')
})

test('franchiseSanityFlags: catches inverted investment range', () => {
  const flags = franchiseSanityFlags({ total_investment_min: 500000, total_investment_max: 100000 })
  assert.ok(flags.some((f) => f.includes('max is below')), 'inverted range flagged')
})

test('franchisePublishable: brand name is the minimum bar', () => {
  assert.equal(franchisePublishable({ brand_name: 'FreshBites' }), true)
  assert.equal(franchisePublishable({ brand_name: '  ' }), false)
  assert.equal(franchisePublishable({}), false)
})
