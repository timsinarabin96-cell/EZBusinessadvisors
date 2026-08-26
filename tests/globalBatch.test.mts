import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/global_compliance_schema.sql', 'utf8')
const compliance = readFileSync('lib/compliance.ts', 'utf8')
const stock = readFileSync('lib/stockImages.ts', 'utf8')
const quality = readFileSync('lib/listingQuality.ts', 'utf8')
const countryPage = readFileSync('app/(public)/marketplace/country/[code]/page.tsx', 'utf8')
const complianceRoute = readFileSync('app/api/compliance/route.ts', 'utf8')
const marketplace = readFileSync('lib/marketplace.ts', 'utf8')
const recast = readFileSync('lib/recast.ts', 'utf8')
const card = readFileSync('components/public/PublicListingCard.tsx', 'utf8')

test('global: schema adds country/currency + compliance matrix + license fields', () => {
  assert.match(schema, /add column if not exists country_code text/)
  assert.match(schema, /add column if not exists currency_code text not null default 'USD'/)
  assert.match(schema, /create table if not exists public\.compliance_jurisdictions/)
  assert.match(schema, /re_license_when_real_estate/)
  assert.match(schema, /re_license_always/)
  assert.match(schema, /California requires a real-estate broker license/)
  assert.match(schema, /add column if not exists license_number text/)
  assert.match(schema, /create table if not exists public\.listing_compliance_checks/)
})

test('global: compliance engine evaluates jurisdictions and builds checklists', () => {
  assert.match(compliance, /export function extractStateCode/)
  assert.match(compliance, /export async function getJurisdiction/)
  assert.match(compliance, /export async function evaluateListingCompliance/)
  assert.match(compliance, /export async function listJurisdictions/)
  assert.match(compliance, /re_license_always/)
  assert.match(compliance, /license_required/)
  assert.match(compliance, /real_estate_disclosure/)
  assert.match(compliance, /NOT legal advice/i)
})

test('global: free stock photo library covers industries with fallback', () => {
  assert.match(stock, /FREE_IMAGE_LIBRARY/)
  assert.match(stock, /'Laundromat'/)
  assert.match(stock, /'Restaurant'/)
  assert.match(stock, /'Car Wash'/)
  assert.match(stock, /export function stockImageFor/)
  assert.match(stock, /export function stockImagesFor/)
  assert.match(stock, /export function placeholderImageFor/)
  assert.match(stock, /export function listingImageFor/)
  assert.match(stock, /GENERIC/)
  assert.match(stock, /images\.unsplash\.com/)
})

test('global: listing quality score checks the elements buyers respond to', () => {
  assert.match(quality, /export function scoreListingQuality/)
  assert.match(quality, /Photo/)
  assert.match(quality, /Headline/)
  assert.match(quality, /Highlights/)
  assert.match(quality, /Asking price/)
  assert.match(quality, /NDA/)
  assert.match(quality, /Financing/)
  assert.match(quality, /export function qualityBand/)
  assert.match(quality, /Ready to attract buyers/)
})

test('global: country pages are worldwide SEO entry points', () => {
  assert.match(countryPage, /Worldwide Marketplace/)
  assert.match(countryPage, /generateStaticParams/)
  assert.match(countryPage, /COUNTRY_NAMES/)
  assert.match(countryPage, /Businesses for Sale in/)
  assert.match(countryPage, /CollectionPage/)
  assert.match(countryPage, /country_code/)
  assert.match(countryPage, /Sell your business — anywhere in the world/)
})

test('global: compliance API evaluates a listing (broker tooling)', () => {
  assert.match(complianceRoute, /export async function GET/)
  assert.match(complianceRoute, /authenticateProfileRequest/)
  assert.match(complianceRoute, /evaluateListingCompliance/)
  assert.match(complianceRoute, /scoreListingQuality/)
  assert.match(complianceRoute, /jurisdictions=1/)
  assert.match(complianceRoute, /Advisory only/)
})

test('global: marketplace feed + search support country filter', () => {
  assert.match(marketplace, /country_code\?: string \| null/)
  assert.match(marketplace, /currency_code\?: string \| null/)
  assert.match(marketplace, /country\?: string/)
  assert.match(marketplace, /listing\.country_code \|\| 'US'/)
})

test('global: currency symbols + multi-currency formatting', () => {
  assert.match(recast, /CURRENCY_SYMBOLS/)
  assert.match(recast, /USD: '\$'/)
  assert.match(recast, /EUR: '€'/)
  assert.match(recast, /export const currencySymbol/)
  assert.match(recast, /export const fmtMoney/)
})

test('global: public card uses free stock images + auto placeholder + currency display', () => {
  assert.match(card, /listingImageFor/)
  assert.match(card, /fmt\$/)
  assert.match(card, /priceTeaser/)
})
