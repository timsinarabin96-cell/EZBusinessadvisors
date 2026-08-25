import assert from 'node:assert/strict'
import test from 'node:test'

const { publicListingSorter } = await import('../lib/publicListingSort.ts')

type L = {
  id: string
  asking_price: number | null
  annual_revenue: number | null
  sde: number | null
  is_featured: boolean
  created_at: string | null
}

const l = (p: Partial<L>): L => ({
  id: p.id || 'x',
  asking_price: p.asking_price ?? null,
  annual_revenue: p.annual_revenue ?? null,
  sde: p.sde ?? null,
  is_featured: p.is_featured ?? false,
  created_at: p.created_at ?? null,
})

test('sorter: default = featured first, then newest', () => {
  const a = l({ id: 'a', is_featured: false, created_at: '2026-01-01' })
  const b = l({ id: 'b', is_featured: true, created_at: '2025-01-01' })
  const c = l({ id: 'c', is_featured: false, created_at: '2026-06-01' })
  const sorted = [a, b, c].sort(publicListingSorter(undefined))
  assert.equal(sorted[0].id, 'b') // featured first
  assert.equal(sorted[1].id, 'c') // newest of non-featured
  assert.equal(sorted[2].id, 'a')
})

test('sorter: price_asc puts cheapest first, nulls last', () => {
  const a = l({ id: 'a', asking_price: 500000 })
  const b = l({ id: 'b', asking_price: 100000 })
  const c = l({ id: 'c', asking_price: null })
  const sorted = [a, b, c].sort(publicListingSorter('price_asc'))
  assert.deepEqual(sorted.map((x) => x.id), ['b', 'a', 'c'])
})

test('sorter: price_desc puts most expensive first', () => {
  const a = l({ id: 'a', asking_price: 500000 })
  const b = l({ id: 'b', asking_price: 9000000 })
  const sorted = [a, b].sort(publicListingSorter('price_desc'))
  assert.deepEqual(sorted.map((x) => x.id), ['b', 'a'])
})

test('sorter: revenue_desc sorts by annual revenue', () => {
  const a = l({ id: 'a', annual_revenue: 800000 })
  const b = l({ id: 'b', annual_revenue: 2000000 })
  const sorted = [a, b].sort(publicListingSorter('revenue_desc'))
  assert.deepEqual(sorted.map((x) => x.id), ['b', 'a'])
})

test('sorter: multiple_desc sorts by price/SDE ratio, skips nulls', () => {
  const a = l({ id: 'a', asking_price: 300000, sde: 100000 }) // 3.0x
  const b = l({ id: 'b', asking_price: 500000, sde: 100000 }) // 5.0x
  const c = l({ id: 'c', asking_price: 100000, sde: null }) // 0 → last
  const sorted = [a, b, c].sort(publicListingSorter('multiple_desc'))
  assert.deepEqual(sorted.map((x) => x.id), ['b', 'a', 'c'])
})
