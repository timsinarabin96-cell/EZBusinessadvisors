import assert from 'node:assert/strict'
import test from 'node:test'

const { suggestAddBacks, totalSuggestedAddBacks } = await import('../lib/recastSuggestions.ts')

test('recast suggestions: thin SDE margin → owner salary add-back', () => {
  const s = suggestAddBacks({ annual_revenue: 1_000_000, sde: 120_000 }) // 12% margin
  const owner = s.find((x) => x.category === 'owner_salary')
  assert.ok(owner, 'should suggest owner salary')
  assert.equal(owner!.amount, 120_000) // 12% of $1M
  assert.equal(owner!.confidence, 'medium')
})

test('recast suggestions: healthy margin → no owner-salary suggestion', () => {
  const s = suggestAddBacks({ annual_revenue: 1_000_000, sde: 400_000 }) // 40% margin
  assert.ok(!s.some((x) => x.category === 'owner_salary'), 'no owner salary suggestion at healthy margin')
})

test('recast suggestions: ebitda < sde → depreciation add-back', () => {
  const s = suggestAddBacks({ sde: 200_000, ebitda: 120_000, annual_revenue: 800_000 })
  const da = s.find((x) => x.category === 'depreciation')
  assert.ok(da, 'should suggest depreciation')
  assert.equal(da!.amount, Math.round((200_000 - 120_000) * 0.7))
  assert.equal(da!.confidence, 'high')
})

test('recast suggestions: home services → personal vehicle add-back', () => {
  const s = suggestAddBacks({ industry: 'Home Services', sub_industry: 'Cleaning', annual_revenue: 400_000, sde: 90_000 })
  assert.ok(s.some((x) => x.category === 'personal'), 'personal vehicle suggestion for home services')
})

test('recast suggestions: absentee owner → replacement manager allowance', () => {
  const s = suggestAddBacks({ owner_hours_per_week: 10, sde: 150_000 })
  assert.ok(s.some((x) => x.label.includes('Replacement manager')), 'replacement manager suggestion')
  assert.equal(s.find((x) => x.label.includes('Replacement manager'))!.amount, Math.round(Math.min(150_000 * 0.3, 75_000)))
})

test('recast suggestions: total is sum of amounts', () => {
  const input = { annual_revenue: 900_000, sde: 130_000, ebitda: 90_000, industry: 'Home Services' }
  const list = suggestAddBacks(input)
  const expected = list.reduce((s, x) => s + x.amount, 0)
  assert.equal(totalSuggestedAddBacks(input), expected)
})

test('recast suggestions: empty profile → safe, no throw', () => {
  const s = suggestAddBacks({})
  assert.ok(Array.isArray(s))
  assert.ok(s.every((x) => x.amount >= 0 && x.label && x.rationale))
})
