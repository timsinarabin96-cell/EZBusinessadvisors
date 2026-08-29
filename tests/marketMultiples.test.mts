import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const core = readFileSync('lib/marketMultiplesCore.ts', 'utf8')
const lib = readFileSync('lib/marketMultiples.ts', 'utf8')
const val = readFileSync('lib/valuation.ts', 'utf8')
const bov = readFileSync('lib/bov.ts', 'utf8')
const cim = readFileSync('lib/cim.ts', 'utf8')
const page = readFileSync('components/valuation/ValuationEnginePanel.tsx', 'utf8')
const schema = readFileSync('sql/market_multiples_schema.sql', 'utf8')
const compsPage = readFileSync('app/(public)/marketplace/comps/page.tsx', 'utf8')
const industryPage = readFileSync('app/(public)/marketplace/industry/[slug]/page.tsx', 'utf8')
const dealDetail = readFileSync('components/deals/DealDetail.tsx', 'utf8')

// Import the pure helpers (dependency-free core — no path aliases).
const { matchIndustry, bandsForIndustry, bandForIndustry, MARKET_MULTIPLES } =
  await import('../lib/marketMultiplesCore.ts')

// ---------------------------------------------------------------------------
// Core behavior
// ---------------------------------------------------------------------------
test('market-multiples: home care resolves to a 4-5x EBITDA band', () => {
  assert.equal(matchIndustry('Home Care Agency'), 'Home care')
  const band = bandForIndustry('Home Care Agency', 'EBITDA')
  assert.ok(band, 'expected an EBITDA band for home care')
  assert.equal(band!.industry, 'Home care')
  assert.equal(band!.basis, 'EBITDA')
  assert.equal(band!.min, 4.0)
  assert.equal(band!.max, 5.0)
})

test('market-multiples: SDE band returned when no EBITDA preference', () => {
  const band = bandForIndustry('home care')
  assert.equal(band!.basis, 'EBITDA') // EBITDA is preferred when present
})

test('market-multiples: fuzzy matching handles common phrasings', () => {
  assert.equal(matchIndustry('Home Health Care'), 'Home care')
  assert.equal(matchIndustry('Restaurant'), 'Restaurants')
  assert.equal(matchIndustry('Automotive repair shop'), 'Auto repair')
  assert.equal(matchIndustry('Medical practice'), 'Healthcare')
  assert.equal(matchIndustry('Convenience store with gas'), 'Gas station / C-Store')
  assert.equal(matchIndustry('Unknown niche'), null)
})

test('market-multiples: bandsForIndustry returns both bases when seeded', () => {
  const bands = bandsForIndustry('software company')
  assert.ok(bands && bands.length >= 2)
  assert.ok(bands!.some((b) => b.basis === 'SDE'))
  assert.ok(bands!.some((b) => b.basis === 'EBITDA'))
})

test('market-multiples: seed covers key industries', () => {
  const industries = MARKET_MULTIPLES.map((b) => b.industry)
  for (const want of ['Home care', 'Restaurants', 'Manufacturing', 'Healthcare', 'Retail', 'Software / SaaS']) {
    assert.ok(industries.includes(want), `missing seed industry: ${want}`)
  }
})

test('market-multiples: ANY business gets a band — universal fallback', () => {
  // Unknown niche industries must still resolve to a defensible default band
  // (this is the 'any M&A deal or side business' guarantee).
  const sde = bandForIndustry('Oddball niche nobody seeded')
  assert.ok(sde, 'unknown industry must still get an SDE band')
  assert.equal(sde.industry, 'General small business')
  assert.equal(sde.basis, 'SDE')
  assert.equal(sde.min, 2.5)
  assert.equal(sde.max, 3.5)

  const ebitda = bandForIndustry('Oddball niche nobody seeded', 'EBITDA')
  assert.equal(ebitda.basis, 'EBITDA')
  assert.equal(ebitda.min, 3.5)
  assert.equal(ebitda.max, 5.0)

  // Broad M&A categories resolve to real seeded bands.
  assert.equal(bandForIndustry('Hotel business', 'EBITDA').industry, 'Hotels / Motels')
  assert.equal(bandForIndustry('Staffing agency', 'EBITDA').industry, 'Staffing')
  assert.equal(bandForIndustry('Insurance agency', 'EBITDA').industry, 'Insurance agency')
  assert.equal(bandForIndustry('Vending route', 'SDE').industry, 'Vending')
  assert.equal(bandForIndustry('Bakery', 'SDE').industry, 'Bakery')
  assert.equal(bandForIndustry('Marina', 'EBITDA').industry, 'Marina')
  assert.equal(bandForIndustry('Golf course', 'EBITDA').industry, 'Golf course')
})

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
test('market-multiples: valuation engine imports core and exposes market band', () => {
  assert.match(val, /bandForIndustry/)
  assert.match(val, /market\?: \{ industry: string; basis: string; min: number; max: number; source\?: string \| null \}/)
  assert.match(val, /const market = bandForIndustry/)
  assert.match(val, /ebitda > 0 && market\?\.basis === 'EBITDA'/)
  assert.match(val, /ebitda/)
  // Existing static table + API surface must remain intact
  assert.match(val, /INDUSTRY_MULTIPLES/)
  assert.match(val, /export function multipleForIndustry/)
})

test('market-multiples: BOV cites the market band in marketing sections', () => {
  assert.match(bov, /bandForIndustry/)
  assert.match(bov, /Market Sale Multiples/)
  assert.match(bov, /typically trades/)
})

test('market-multiples: CIM cites the market band in industry analysis', () => {
  assert.match(cim, /bandForIndustry/)
  assert.match(cim, /typically transact at/)
})

test('market-multiples: valuation dashboard renders the market band cell', () => {
  assert.match(page, /Market band/)
  assert.match(page, /m\.market\?\.min/)
})

test('market-multiples: schema seeds home care at 4-5x EBITDA with RLS', () => {
  assert.match(schema, /create table if not exists public\.market_multiples/)
  assert.match(schema, /basis\s+text not null default 'SDE' check \(basis in \('SDE', 'EBITDA'\)\)/)
  assert.match(schema, /4\.0, 5\.0, 'Home care/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /for select to authenticated using \(true\)/)
  assert.match(schema, /revoke all on public\.market_multiples from anon/)
})

test('market-multiples: public comps page renders the typical-multiples reference table', () => {
  assert.match(compsPage, /MARKET_MULTIPLES/)
  assert.match(compsPage, /Typical Sale Multiples by Industry/)
  assert.match(compsPage, /EBITDA multiple/)
  assert.match(compsPage, /marketplace\/industry/)
})

test('market-multiples: public industry pages show the typical sale multiple band', () => {
  assert.match(industryPage, /bandForIndustry/)
  assert.match(industryPage, /Typical sale multiple/)
  assert.match(industryPage, /usually sell/)
})

test('market-multiples: CRM deal drawer surfaces the market band', () => {
  assert.match(dealDetail, /bandForIndustry/)
  assert.match(dealDetail, /Market: \{band\.industry\} typically/)
})
