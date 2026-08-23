import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const publicFiles = [
  'lib/marketplace.ts',
  'app/sitemap.ts',
  'app/(public)/marketplace/listings/[id]/page.tsx',
  'app/(public)/marketplace/listings/page.tsx',
  'components/public/PublicListingCard.tsx',
  'components/public/ListingDetailInteractive.tsx',
]

test('public marketplace code never selects from the private listings table', () => {
  for (const file of publicFiles) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /\.from\(['"]listings['"]\)/, `${file} queries the private listings table`)
  }
})

test('public listing pages use the seller-approved RPC', () => {
  const marketplace = readFileSync('lib/marketplace.ts', 'utf8')
  const detail = readFileSync('app/(public)/marketplace/listings/[id]/page.tsx', 'utf8')
  const sitemap = readFileSync('app/sitemap.ts', 'utf8')

  assert.match(marketplace, /get_public_listing_feed/)
  assert.match(detail, /get_public_listing_feed/)
  assert.match(sitemap, /get_public_listing_feed/)
})

test('public RPC return contract excludes identifying private fields', () => {
  const sql = readFileSync('sql/emergency_public_marketplace_lockdown.sql', 'utf8')
  const functionSql = sql.slice(sql.indexOf('create or replace function public.get_public_listing_feed'))
  const returnContract = functionSql.slice(functionSql.indexOf('returns table'), functionSql.indexOf('language sql'))

  for (const privateField of ['business_name', 'property_address', 'website', 'reason_for_sale', 'agent_id']) {
    assert.doesNotMatch(returnContract, new RegExp(`\\b${privateField}\\b`), `${privateField} is exposed by the public RPC`)
  }
})

test('public RPC requires seller approval and approved listing state', () => {
  const sql = readFileSync('sql/emergency_public_marketplace_lockdown.sql', 'utf8')
  assert.match(sql, /pl\.seller_approved_at is not null/)
  assert.match(sql, /l\.status = 'active'/)
  assert.match(sql, /l\.review_stage = 'approved'/)
})
