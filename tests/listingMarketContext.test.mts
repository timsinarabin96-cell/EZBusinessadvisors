import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/listingMarketContextCore.ts', 'utf8')
const lib = readFileSync('lib/listingMarketContext.ts', 'utf8')
const panel = readFileSync('components/public/ListingMarketContextPanel.tsx', 'utf8')
const page = readFileSync('app/(public)/marketplace/listings/[id]/page.tsx', 'utf8')

// Import the pure core (dependency-free — no path aliases).
const { buildMarketContext, pricePosition } = await import('../lib/listingMarketContextCore.ts')

const band = { industry: 'Home care', basis: 'EBITDA' as const, min: 4.0, max: 5.0 }

test('market-context: price within the band is a neutral position', () => {
  const pos = pricePosition(450000, 100000, 100000, band)
  assert.equal(pos!.position, 'within')
  assert.equal(pos!.multiple, 4.5)
})

test('market-context: price below the band is a value entry point', () => {
  const pos = pricePosition(350000, 100000, 100000, band)
  assert.equal(pos!.position, 'below')
  assert.equal(pos!.multiple, 3.5)
})

test('market-context: price above the band is flagged as premium', () => {
  const pos = pricePosition(600000, 100000, 100000, band)
  assert.equal(pos!.position, 'above')
})

test('market-context: no earnings means position unknown but still present', () => {
  const pos = pricePosition(500000, null, null, band)
  assert.equal(pos!.position, 'unknown')
  assert.equal(pos!.multiple, null)
})

test('market-context: teaser cites the multiple and market range', () => {
  const ctx = buildMarketContext(
    { industry: 'Home Care', asking_price: 450000, sde: 100000, ebitda: 100000 },
    band,
    null,
  )
  assert.match(ctx.teaser, /4\.5× EBITDA/)
  assert.match(ctx.teaser, /4\.0–5\.0×/)
  assert.match(ctx.teaser, /in line with/)
})

test('market-context: comp callouts appear when comparable deals exist', () => {
  const ctx = buildMarketContext(
    { industry: 'Home Care', asking_price: 450000, sde: 100000, ebitda: 100000 },
    band,
    { count: 3, avgMultiple: 4.4, medianSalePrice: 480000, avgDaysToSell: 210 },
  )
  const bullets = ctx.bullets.join(' ')
  assert.match(bullets, /3 comparable deals/)
  assert.match(bullets, /median \$480,000/)
  assert.match(bullets, /210 days/)
})

test('market-context: universal fallback still yields a teaser', () => {
  const ctx = buildMarketContext(
    { industry: 'Oddball niche', asking_price: 100000, sde: null, ebitda: null },
    { industry: 'General small business', basis: 'SDE', min: 2.5, max: 3.5 },
    null,
  )
  assert.ok(ctx.teaser.length > 0)
})

test('market-context: server wrapper assembles band + comps', () => {
  assert.match(lib, /bandForIndustry/)
  assert.match(lib, /buildSoldCompsReport/)
  assert.match(lib, /buildMarketContext/)
})

test('market-context: public listing page renders the panel', () => {
  assert.match(page, /ListingMarketContextPanel/)
  assert.match(page, /fetchListingMarketContext/)
  assert.match(page, /marketCtx/)
})

test('market-context: panel shows band, position, comps and teaser', () => {
  assert.match(panel, /Typical sale multiple/)
  assert.match(panel, /Asking price position/)
  assert.match(panel, /Comparable deals/)
  assert.match(panel, /Market Context/)
})
