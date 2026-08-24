import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/soldComps.ts', 'utf8')
const page = readFileSync('app/(public)/marketplace/comps/page.tsx', 'utf8')
const nav = readFileSync('components/public/PublicNav.tsx', 'utf8')

// Import the pure helpers (dependency-free core — no path aliases).
const { extractState, daysBetween } = await import('../lib/soldCompsCore.ts')

test('sold-comps: lib aggregates anonymized sold data into market stats', () => {
  assert.match(lib, /export interface SoldCompStat/)
  assert.match(lib, /export interface SoldCompsReport/)
  assert.match(lib, /from '@\/lib\/soldCompsCore\.ts'/)
  assert.match(lib, /export async function buildSoldCompsReport/)
  assert.match(lib, /get_public_sold_listings/)
  assert.match(lib, /avgMultiple/)
  assert.match(lib, /medianSalePrice/)
  assert.match(lib, /avgDaysToSell/)
  assert.match(lib, /never exposes names or addresses/)
})

test('sold-comps: core extracts only real US state codes', () => {
  const core = readFileSync('lib/soldCompsCore.ts', 'utf8')
  assert.match(core, /US_STATES/)
  assert.match(core, /export function extractState/)
  assert.match(core, /export function daysBetween/)
})

test('sold-comps: extractState pulls trailing state codes from locations', () => {
  assert.equal(extractState('Harrisburg, PA'), 'PA')
  assert.equal(extractState('San Diego, CA'), 'CA')
  assert.equal(extractState('Austin, TX'), 'TX')
  assert.equal(extractState('London, UK'), null)
  assert.equal(extractState('Toronto ON'), null)  // ON = Ontario, not a US state
})

test('sold-comps: daysBetween computes listing-to-sale duration', () => {
  assert.equal(daysBetween('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), 31)
  assert.equal(daysBetween(null), null)
  assert.equal(daysBetween('not-a-date'), null)
  const d = daysBetween(new Date(Date.now() - 10 * 86400000).toISOString())
  assert.ok(d !== null && d >= 9 && d <= 11, `expected ~10 days, got ${d}`)
})

test('sold-comps: public page renders metrics, industry table, state chips, CTA', () => {
  assert.match(page, /What Businesses Actually Sell For/)
  assert.match(page, /buildSoldCompsReport/)
  assert.match(page, /Multiples by Industry/)
  assert.match(page, /Avg Multiple/)
  assert.match(page, /Median Price/)
  assert.match(page, /Avg Days to Sell/)
  assert.match(page, /Where Deals Are Closing/)
  assert.match(page, /Get My Valuation/)
  assert.match(page, /Dataset/)
  assert.match(page, /force-dynamic/)
})

test('sold-comps: public nav links to the comps page', () => {
  assert.match(nav, /marketplace\/comps/)
  assert.match(nav, /Sale Comps/)
})
