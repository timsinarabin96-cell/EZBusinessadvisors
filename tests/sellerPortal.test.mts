import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/seller_portal_schema.sql', 'utf8')
const lib = readFileSync('lib/sellerPortal.ts', 'utf8')
const route = readFileSync('app/api/seller-portal/route.ts', 'utf8')
const page = readFileSync('app/seller/[token]/page.tsx', 'utf8')
const intake = readFileSync('app/api/public/seller-intake/route.ts', 'utf8')
const sellPage = readFileSync('app/(public)/marketplace/sell/page.tsx', 'utf8')

test('seller portal: schema adds portal tokens to leads and listings', () => {
  assert.match(schema, /alter table public\.seller_leads/)
  assert.match(schema, /add column if not exists portal_token text/)
  assert.match(schema, /alter table public\.listings/)
  assert.match(schema, /seller_leads_portal_token_idx/)
  assert.match(schema, /listings_portal_token_idx/)
})

test('seller portal: client wrapper fetches by token and maps statuses', () => {
  assert.match(lib, /fetchSellerPortal/)
  assert.match(lib, /api\/seller-portal\?token=/)
  assert.match(lib, /leadStatusLabel/)
  assert.match(lib, /views7d/)
  assert.match(lib, /ndaRequests/)
})

test('seller portal: API is public + token-gated and returns lead/listing/stats', () => {
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /token\.length < 12/)
  assert.match(route, /from\('seller_leads'\)/)
  assert.match(route, /portal_token/)
  assert.match(route, /from\('listings'\)/)
  assert.match(route, /from\('listing_views'\)/)
  assert.match(route, /from\('data_room_access_requests'\)/)
  assert.match(route, /nextSteps/)
  assert.match(route, /Link not found or expired/)
})

test('seller portal: page renders status, live stats, and next steps', () => {
  assert.match(page, /\/seller\/\[token\]/)
  assert.match(page, /Seller Portal/)
  assert.match(page, /fetchSellerPortal/)
  assert.match(page, /Buyer views/)
  assert.match(page, /Confidential requests/)
  assert.match(page, /What happens next/)
  assert.match(page, /Link not found/)
})

test('seller portal: intake generates a token and returns the private link', () => {
  assert.match(intake, /generatePortalToken/)
  assert.match(intake, /crypto\.getRandomValues/)
  assert.match(intake, /portal_token: portalToken/)
  assert.match(intake, /seller\/\$\{portalToken\}/)
  assert.match(intake, /portalUrl/)
})

test('seller portal: sell page confirmation surfaces the private link', () => {
  assert.match(sellPage, /portalUrl/)
  assert.match(sellPage, /setPortalUrl/)
  assert.match(sellPage, /Your private seller portal/)
  assert.match(sellPage, /Save this link/)
})
