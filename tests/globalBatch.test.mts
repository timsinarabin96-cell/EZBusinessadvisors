import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/global_compliance_schema.sql', 'utf8')
const compliance = readFileSync('lib/compliance.ts', 'utf8')
const stock = readFileSync('lib/stockImages.ts', 'utf8')
const quality = readFileSync('lib/listingQuality.ts', 'utf8')
const countryPage = readFileSync('app/(public)/marketplace/country/[code]/page.tsx', 'utf8')
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
  assert.match(stock, /export function bestStockImage/)
  assert.match(stock, /GENERIC/)
  assert.match(stock, /export function proxiedStockUrl/)
  assert.match(stock, /images\.unsplash\.com/)
})

test('global: real industry photo is preferred before the branded placeholder', () => {
  // listingImageFor must try a real stock photo (sub-industry → industry → generic)
  // before falling back to the branded placeholder.
  assert.match(stock, /const stock = bestStockImage\(opts\.subIndustry \|\| null, industry\)/)
  assert.match(stock, /if \(stock\) return proxiedStockUrl\(stock\)/)
  // Fuzzy matching lets "Bakery Cafe" resolve to the 'Bakery' photo.
  assert.match(stock, /subLower\.includes\(k\) \|\| k\.includes\(subLower\)/)
  assert.match(stock, /'Bakery': \['https:\/\/images\.unsplash\.com\//)
  assert.match(stock, /'Plumbing': \['https:\/\/images\.unsplash\.com\//)
})

test('global: flyer page is server-safe — print action lives in a client component', () => {
  const flyer = readFileSync('app/(public)/flyer/[id]/page.tsx', 'utf8')
  // Server components can't pass onClick handlers; the print button must be a client island.
  assert.doesNotMatch(flyer, /<button[^>]*onClick/)
  assert.match(flyer, /PrintFlyerButton/)
  const btn = readFileSync('components/public/PrintFlyerButton.tsx', 'utf8')
  assert.match(btn, /'use client'/)
  assert.match(btn, /window\.print\(\)/)
})

test('global: dashboard + public card + detail hero pass sub_industry to image fallback', () => {
  const dash = readFileSync('components/listings/ListingsDashboard.tsx', 'utf8')
  assert.match(dash, /subIndustry: \(listing as any\)\.sub_industry/)
  assert.match(card, /subIndustry: listing\.sub_industry/)
  const detail = readFileSync('components/public/ListingDetailInteractive.tsx', 'utf8')
  assert.match(detail, /listingImageFor\(listing\.gallery_urls, listing\.industry/)
  assert.match(detail, /subIndustry: listing\.sub_industry/)
})

test('global: publish seeds gallery with a real stock photo when listing has no photos', () => {
  const publish = readFileSync('lib/publish.ts', 'utf8')
  assert.match(publish, /bestStockImage\(listing\.sub_industry, listing\.industry\)/)
  assert.match(publish, /return stock \? \[stock\] : \[\]/)
  const studio = readFileSync('components/listings/IntelligentListingForm.tsx', 'utf8')
  assert.match(studio, /listingImageFor\(form\.gallery_images \?\? \[\], form\.industry/)
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

test('global: compliance lib evaluates a listing (used by publish, not a dead route)', () => {
  assert.match(compliance, /export async function evaluateListingCompliance/)
  assert.match(compliance, /compliance_jurisdictions/)
  assert.match(compliance, /Advisory tooling \(NOT legal advice\)/)
  assert.match(compliance, /export function extractStateCode/)
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

test('global: lead marketplace has per-lead pricing tiers + platform fee', () => {
  const lib = readFileSync('lib/leadMarketplace.ts', 'utf8')
  assert.match(lib, /LEAD_TIERS/)
  assert.match(lib, /platformFeePct/)
  assert.match(lib, /leadTierOf/)
  assert.match(lib, /platform_fee_cents/)
  assert.match(lib, /tier: 'standard' \| 'premium' \| 'elite'/)
  const route = readFileSync('app/api/lead-marketplace/route.ts', 'utf8')
  assert.match(route, /tier: body\?\.tier/)
  const page = readFileSync('components/network/LeadMarketplacePanel.tsx', 'utf8')
  assert.match(page, /LEAD_TIERS\.map/)
  assert.match(page, /selectedTier/)
})

test('global: newsletter ad slot — sponsor injected into marketing emails only', () => {
  const ad = readFileSync('lib/newsletterAd.ts', 'utf8')
  assert.match(ad, /fetchNewsletterSponsor/)
  assert.match(ad, /newsletterSponsorHtml/)
  assert.match(ad, /injectNewsletterSponsor/)
  assert.match(ad, /slot_key', 'newsletter_slot'/)
  assert.match(ad, /Sponsored/)
  const email = readFileSync('lib/email.ts', 'utf8')
  assert.match(email, /fetchNewsletterSponsor/)
  assert.match(email, /injectNewsletterSponsor/)
  // Marketing kinds get the sponsor; security kinds must NOT.
  assert.match(email, /kind === 'deal_notification' \|\| kind === 'match_alert'/)
  assert.match(email, /password_reset/)
  const adminAds = readFileSync('app/admin/ads/page.tsx', 'utf8')
  assert.match(adminAds, /newsletter_slot/)
  assert.match(adminAds, /newsletter_slot: '\$150\/send/)
})
