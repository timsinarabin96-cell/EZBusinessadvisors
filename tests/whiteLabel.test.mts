import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const marketplace = readFileSync('lib/marketplace.ts', 'utf8')
const theme = readFileSync('lib/agencyTheme.ts', 'utf8')
const publicAgency = readFileSync('lib/publicAgency.ts', 'utf8')
const soldComps = readFileSync('lib/soldComps.ts', 'utf8')

test('white-label: feed fetchers accept an agency scope and pass it to the RPC', () => {
  assert.match(marketplace, /fetchPublicFeed\(identifier: string \| null = null, agency: string \| null = null\)/)
  assert.match(marketplace, /p_agency: agency/)
  assert.match(marketplace, /fetchMarketplaceStats\(agency: string \| null = null\)/)
  assert.match(marketplace, /fetchFeaturedListings\(limit = 6, agency: string \| null = null\)/)
  assert.match(marketplace, /fetchAllIndustries\(agency: string \| null = null\)/)
  assert.match(marketplace, /fetchSoldListings\(agency: string \| null = null\)/)
  assert.match(marketplace, /searchPublicListings\(filters: SearchFilters = \{\}, agency: string \| null = null\)/)
})

test('white-label: sold comps report accepts agency scope', () => {
  assert.match(soldComps, /buildSoldCompsReport\(agency: string \| null = null\)/)
  assert.match(soldComps, /p_agency: agency/)
})

test('white-label: host resolver returns a feed scope (slug/domain/custom_domain)', () => {
  assert.match(theme, /scope: string/)
  assert.match(theme, /scope: agency\.custom_domain \|\| agency\.domain \|\| agency\.slug \|\| ''/)
  assert.match(theme, /slugCandidate/)
})

test('white-label: server helper resolves agency context from headers, fails safe', () => {
  assert.match(publicAgency, /export async function getPublicAgencyContext/)
  assert.match(publicAgency, /resolveAgencyThemeByHost/)
  assert.match(publicAgency, /catch \{/)
  assert.match(publicAgency, /return null \/\/ static generation/)
})

test('white-label: public pages thread the agency scope into feed calls', () => {
  const home = readFileSync('app/(public)/page.tsx', 'utf8')
  assert.match(home, /getPublicAgencyContext/)
  assert.match(home, /fetchFeaturedListings\(6, scope\)/)
  assert.match(home, /fetchMarketplaceStats\(scope\)/)
  assert.match(home, /fetchAllIndustries\(scope\)/)
  assert.match(home, /fetchSoldListings\(scope\)/)

  const hub = readFileSync('app/(public)/marketplace/page.tsx', 'utf8')
  assert.match(hub, /getPublicAgencyContext/)
  assert.match(hub, /fetchMarketplaceStats\(scope\)/)

  const listings = readFileSync('app/(public)/marketplace/listings/page.tsx', 'utf8')
  assert.match(listings, /getPublicAgencyContext/)
  assert.match(listings, /searchPublicListings\(\{[\s\S]*?\}, scope\)/)
  assert.match(listings, /agencyScope=\{scope\}/)
})
