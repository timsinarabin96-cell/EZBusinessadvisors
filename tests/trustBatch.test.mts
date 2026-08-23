import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const soldPage = readFileSync('app/(public)/marketplace/sold/page.tsx', 'utf8')
const valuationRoute = readFileSync('app/api/public/valuation/route.ts', 'utf8')
const valuationForm = readFileSync('components/public/ValuationLeadForm.tsx', 'utf8')
const locationPage = readFileSync('app/(public)/marketplace/location/[slug]/page.tsx', 'utf8')
const marketplaceLib = readFileSync('lib/marketplace.ts', 'utf8')
const homepage = readFileSync('app/(public)/page.tsx', 'utf8')
const nav = readFileSync('components/public/PublicNav.tsx', 'utf8')
const sitemap = readFileSync('app/sitemap.ts', 'utf8')

test('sold wall: page renders proof-of-results with anonymized cards', () => {
  assert.match(soldPage, /Sold Confidentially, Every Time/)
  assert.match(soldPage, /fetchSoldListings/)
  assert.match(soldPage, /SOLD/)
  assert.match(soldPage, /Sold at Multiple/)
  assert.match(soldPage, /never share business names/i)
  assert.match(soldPage, /CollectionPage/)
  assert.match(soldPage, /Get a Free Valuation/)
})

test('sold wall: lib has fetchSoldListings via public RPC', () => {
  assert.match(marketplaceLib, /export interface SoldListing/)
  assert.match(marketplaceLib, /export async function fetchSoldListings/)
  assert.match(marketplaceLib, /get_public_sold_listings/)
  assert.match(marketplaceLib, /multiple/)
})

test('valuation: public API validates + writes seller lead + notifies', () => {
  assert.match(valuationRoute, /export async function POST/)
  assert.match(valuationRoute, /Name and email are required/)
  assert.match(valuationRoute, /valid email address/)
  assert.match(valuationRoute, /from\('seller_leads'\)\.insert/)
  assert.match(valuationRoute, /agency_id/)
  assert.match(valuationRoute, /Free valuation request/)
  assert.match(valuationRoute, /info@ezbusinessadvisors\.com/)
})

test('valuation: homepage lead magnet form posts to API', () => {
  assert.match(valuationForm, /Get your free valuation/)
  assert.match(valuationForm, /\/api\/public\/valuation/)
  assert.match(valuationForm, /revenue_range/)
  assert.match(valuationForm, /business_name/)
  assert.match(valuationForm, /No spam, ever/)
  assert.match(homepage, /ValuationLeadForm/)
})

test('location pages: SEO per-state pages with metadata', () => {
  assert.match(locationPage, /generateMetadata/)
  assert.match(locationPage, /generateStaticParams/)
  assert.match(locationPage, /STATE_MAP/)
  assert.match(locationPage, /Businesses for Sale in/)
  assert.match(locationPage, /CollectionPage/)
  assert.match(locationPage, /location_general/)
})

test('website: sold page linked in nav + sitemap', () => {
  assert.match(nav, /\/marketplace\/sold/)
  assert.match(nav, /Recently Sold/)
  assert.match(sitemap, /\/marketplace\/sold/)
})
