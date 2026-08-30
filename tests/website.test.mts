import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const homepage = readFileSync('app/(public)/page.tsx', 'utf8')
const about = readFileSync('app/(public)/about/page.tsx', 'utf8')
const contact = readFileSync('app/(public)/contact/page.tsx', 'utf8')
const contactRoute = readFileSync('app/api/contact/route.ts', 'utf8')
const brokersDetail = readFileSync('app/(public)/marketplace/brokers/[id]/page.tsx', 'utf8')
const ndaGate = readFileSync('components/public/NdaFinancialsGate.tsx', 'utf8')
const ndaSign = readFileSync('app/api/public/nda/sign/route.ts', 'utf8')
const ndaFinancials = readFileSync('app/api/public/nda/financials/route.ts', 'utf8')
const marketplaceLib = readFileSync('lib/marketplace.ts', 'utf8')
const publicNav = readFileSync('components/public/PublicNav.tsx', 'utf8')
const globals = readFileSync('app/globals.css', 'utf8')

test('website: public homepage exists with hero, search, stats, featured', () => {
  assert.match(homepage, /export const metadata/)
  assert.match(homepage, /Buy or Sell a Business/)
  assert.match(homepage, /fetchFeaturedListings/)
  assert.match(homepage, /fetchMarketplaceStats/)
  assert.match(homepage, /hero-grid/)
  assert.match(homepage, /AuthRedirect/)
  assert.match(homepage, /PublicListingCard/)
  assert.match(homepage, /Browse All Listings/)
  assert.match(homepage, /Get a Free Valuation/)
})

test('website: about and contact pages exist', () => {
  assert.match(about, /About Us/)
  assert.match(about, /Confidential by Default/)
  assert.match(contact, /Get in Touch/)
  assert.match(contact, /ContactForm/)
})

test('website: contact API validates and emails', () => {
  assert.match(contactRoute, /export async function POST/)
  assert.match(contactRoute, /Name, email, and message are required/)
  assert.match(contactRoute, /valid email address/)
  assert.match(contactRoute, /sendEmail/)
  assert.match(contactRoute, /CONTACT_INBOX/)
})

test('website: broker detail page uses public broker functions', () => {
  assert.match(brokersDetail, /fetchPublicBrokerById/)
  assert.match(brokersDetail, /fetchListingsByBroker/)
  assert.match(brokersDetail, /PublicBroker/)
  assert.match(brokersDetail, /PublicMarketplaceListing/)
})

test('website: marketplace lib exposes broker-by-id + listings-by-broker', () => {
  assert.match(marketplaceLib, /export async function fetchPublicBrokerById/)
  assert.match(marketplaceLib, /export async function fetchBrokerByProfileId/)
  assert.match(marketplaceLib, /export async function fetchListingsByBroker/)
  assert.match(marketplaceLib, /broker_id/)
  assert.match(marketplaceLib, /profile_id: string \| null/)
})

test('website: NDA financials gate adapted to local public type', () => {
  assert.match(ndaGate, /PublicMarketplaceListing/)
  assert.match(ndaGate, /api\/public\/nda\/financials/)
  assert.match(ndaGate, /localStorage/)
  assert.match(ndaGate, /unlock_token|token/i)
  assert.doesNotMatch(ndaGate, /PublicListing\b/)
})

test('website: NDA sign + financials routes use the safe public feed', () => {
  assert.match(ndaSign, /createServerClient/)
  assert.match(ndaSign, /get_public_listing_feed/)
  assert.match(ndaSign, /listing_nda_signatures/)
  assert.match(ndaSign, /unlock_token/)
  assert.match(ndaFinancials, /listing_nda_signatures/)
  assert.match(ndaFinancials, /token/)
})

test('website: public nav has About/Contact and auth link', () => {
  assert.match(publicNav, /About/)
  assert.match(publicNav, /Contact/)
  assert.match(publicNav, /publicnav-links/)
  assert.match(publicNav, /publicnav-toggle/)
  assert.match(publicNav, /Broker Login/)
})

test('website: responsive CSS helpers present', () => {
  assert.match(globals, /\.grid-responsive/)
  assert.match(globals, /collapse-md/)
  assert.match(globals, /\.publicnav-links/)
  assert.match(globals, /\.sticky-sidebar/)
  assert.match(globals, /\.listing-gallery-image/)
})

test('website: buyer form schemas + dynamic fields ported', () => {
  const schemas = readFileSync('lib/buyerFormSchemas.ts', 'utf8')
  const fields = readFileSync('components/forms/DynamicFormFields.tsx', 'utf8')
  assert.match(schemas, /NDA_FORM_SECTIONS/)
  assert.match(schemas, /BUYER_PROFILE_SECTIONS/)
  assert.match(fields, /export default/)
  assert.match(fields, /FormValues/)
})
