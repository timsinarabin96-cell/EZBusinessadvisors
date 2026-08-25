import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/staleListingCore.ts', 'utf8')
const lib = readFileSync('lib/staleListing.ts', 'utf8')
const panel = readFileSync('components/listings/StaleListingPanel.tsx', 'utf8')
const dash = readFileSync('components/listings/ListingsDashboard.tsx', 'utf8')

// Import the pure scorer (dependency-free core — no path aliases).
const { assessStaleListing } = await import('../lib/staleListingCore.ts')

const band = { industry: 'Home care', basis: 'EBITDA' as const, min: 4.0, max: 5.0 }

const base = {
  listingId: 'l1',
  businessName: 'Acme Home Care',
  industry: 'Home Care',
  askingPrice: 450000,
  sde: 100000,
  ebitda: 100000,
  ageDays: 20,
  views7d: 3,
  viewsTotal: 6,
  ndaRequests: 1,
  band,
}

test('stale-listing: healthy listing scores low', () => {
  const r = assessStaleListing(base)
  assert.equal(r.status, 'healthy')
  assert.ok(r.score < 30)
  assert.equal(r.flags.length, 0)
})

test('stale-listing: views without inquiries is a high flag', () => {
  const r = assessStaleListing({ ...base, viewsTotal: 15, views7d: 5, ndaRequests: 0, ageDays: 45 })
  assert.ok(r.score >= 30)
  assert.ok(r.flags.some((f) => f.code === 'views_no_inquiries'))
  assert.equal(r.status, 'cooling')
})

test('stale-listing: age past 60 days is stale', () => {
  const r = assessStaleListing({ ...base, ageDays: 75 })
  assert.equal(r.status, 'stale')
  assert.ok(r.flags.some((f) => f.code === 'stale_age'))
})

test('stale-listing: price above the band suggests a market-anchored price', () => {
  // 5.5x EBITDA — above the 4-5x band
  const r = assessStaleListing({ ...base, askingPrice: 550000 })
  assert.ok(r.flags.some((f) => f.code === 'above_market_band'))
  assert.equal(r.suggestedPrice, 500000) // band.max (5.0) x EBITDA 100k
  assert.equal(r.suggestedMultiple, 5.0)
  assert.ok(r.score >= 25)
})

test('stale-listing: unpublished is flagged as not published', () => {
  const r = assessStaleListing({ ...base, ageDays: 0 })
  assert.equal(r.status, 'unpublished')
  assert.equal(r.headline, 'Not published yet')
})

test('stale-listing: wrapper aggregates views/NDA and scores listings', () => {
  assert.match(lib, /fetchStaleListingIntelligence/)
  assert.match(lib, /from\('listing_views'\)/)
  assert.match(lib, /from\('data_room_access_requests'\)/)
  assert.match(lib, /assessStaleListing/)
  assert.match(lib, /bandForIndustry/)
})

test('stale-listing: dashboard mounts the intelligence panel', () => {
  assert.match(panel, /StaleListingPanel|Listing intelligence/)
  assert.match(panel, /attention \{r\.score\}/)
  assert.match(panel, /Price suggestion/)
  assert.match(panel, /Open →/)
  assert.match(dash, /StaleListingPanel/)
  assert.match(dash, /Stale-listing intelligence/)
})
