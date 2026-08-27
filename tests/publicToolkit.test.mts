import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const favLib = readFileSync('lib/publicFavorites.ts', 'utf8')
const matchLib = readFileSync('lib/matchScore.ts', 'utf8')
const card = readFileSync('components/public/PublicListingCard.tsx', 'utf8')
const favoritesPage = readFileSync('app/(public)/marketplace/favorites/page.tsx', 'utf8')
const comparePage = readFileSync('app/(public)/marketplace/compare/page.tsx', 'utf8')
const alertComp = readFileSync('components/public/SavedSearchAlert.tsx', 'utf8')
const profilePanel = readFileSync('components/public/MatchProfilePanel.tsx', 'utf8')
const listingsPage = readFileSync('app/(public)/marketplace/listings/page.tsx', 'utf8')
const searchClient = readFileSync('components/public/SearchListingsClient.tsx', 'utf8')
const nav = readFileSync('components/public/PublicNav.tsx', 'utf8')
const metaLib = readFileSync('lib/publicListingMeta.ts', 'utf8')
const agentCard = readFileSync('components/public/AgentContactCard.tsx', 'utf8')
const agentQr = readFileSync('components/public/AgentQrCode.tsx', 'utf8')
const flyer = readFileSync('app/(public)/flyer/[id]/page.tsx', 'utf8')
const detailPage = readFileSync('app/(public)/marketplace/listings/[id]/page.tsx', 'utf8')
const brokerFloat = readFileSync('components/public/BrokerFloat.tsx', 'utf8')
const detailInteractive = readFileSync('components/public/ListingDetailInteractive.tsx', 'utf8')
const suggestRoute = readFileSync('app/api/search/suggest/route.ts', 'utf8')
const categoriesLib = readFileSync('lib/businessCategories.ts', 'utf8')
const intakeRoute = readFileSync('app/api/listings/intake/route.ts', 'utf8')
const recentViewed = readFileSync('components/public/RecentlyViewed.tsx', 'utf8')

test('flyer: title is white-on-navy, broker card has phone/email/website + vCard QR', () => {
  // The header band is dark navy — the title must be white so it never hides.
  assert.match(flyer, /fontSize: 28, margin: '6px 0 4px', color: '#fff'/)
  // Broker card: phone + email always visible + one-tap actions.
  assert.match(agentCard, /const phone = agent\.phone \|\| agent\.agencyPhone \|\| null/)
  assert.match(agentCard, /const email = agent\.email \|\| agent\.agencyEmail \|\| null/)
  assert.match(agentCard, /displayPhone/)
  assert.match(agentCard, /telHref/)
  // QR is rendered from agent data (works for every agent automatically).
  assert.match(agentCard, /<AgentQrCode name=\{agent\.name\}/)
  assert.match(agentQr, /'use client'/)
  assert.match(agentQr, /BEGIN:VCARD/)
  assert.match(agentQr, /TEL;TYPE=CELL/)
  assert.match(agentQr, /URL:/)
  assert.match(agentQr, /EMAIL:/)
  assert.match(agentQr, /QRCode\.toDataURL/)
  // Meta lib: agency fallback so every broker card is complete.
  assert.match(metaLib, /agencyPhone/)
  assert.match(metaLib, /agencyEmail/)
  assert.match(metaLib, /agencyWebsite/)
  assert.match(metaLib, /phone: clean\(broker\.phone\) \|\| clean\(agency\?\.phone\)/)
})

test('marketplace: broker info is a floating popup (like the AI bot), not a big inline card', () => {
  // Detail page mounts the floating widget instead of a full-width inline card.
  assert.match(detailPage, /<BrokerFloat agent=\{meta\?\.agent \|\| null\} \/>/)
  assert.doesNotMatch(detailPage, /<AgentContactCard agent=/)
  assert.match(brokerFloat, /'use client'/)
  assert.match(brokerFloat, /position: 'fixed', bottom: 92, right: 22/)
  assert.match(brokerFloat, /AgentContactCard agent=\{agent\} \/>/)
})

test('marketplace: listing hero never shows a black void — onError swaps to branded cover', () => {
  assert.match(detailInteractive, /heroFailed/)
  assert.match(detailInteractive, /onError=\{\(\) => setHeroFailed\(true\)\}/)
  assert.match(card, /imgError/)
  assert.match(card, /onError=\{\(\) => setImgError\(true\)\}/)
})

test('marketplace: category suggestions use the curated business taxonomy, not junk', () => {
  assert.match(categoriesLib, /BUSINESS_CATEGORIES/)
  assert.match(categoriesLib, /'Retail'/)
  assert.match(categoriesLib, /export function suggestBusinessCategories/)
  assert.match(categoriesLib, /titleCaseCategory/)
  assert.match(suggestRoute, /suggestBusinessCategories\(q, listingValues\)/)
  assert.match(suggestRoute, /titleCaseCategory\(String\(\(row as any\)\[col\] \|\| ''\)\)/)
})

test('marketplace: cards + spotlight use plain img (not optimizer) so photos always load', () => {
  // The image optimizer (next/image) rejects our proxied stock-photo URLs (400),
  // which made cards fall back to letter blocks. Cards now use plain <img>.
  assert.match(card, /<img src=\{image\}/)
  assert.doesNotMatch(card, /<Image src=\{image\}/)
  assert.match(listingsPage, /<img src=\{img\}/)
  assert.doesNotMatch(listingsPage, /<Image src=\{img\}/)
})

test('marketplace: recently viewed stores a real image and renders proxied + fallback', () => {
  assert.match(detailInteractive, /image: listingImageFor\(listing\.gallery_urls, listing\.industry/)
  assert.match(recentViewed, /proxiedStockUrl\(item\.image\)/)
  assert.match(recentViewed, /onError=\{\(e\) =>/)
})

test('marketplace: intake accepts the studio context field (fixes Build my listing error)', () => {
  // The studio posts pasted text as `context`; the API used to require `notes`,
  // so every Build-my-listing click failed with "Field: notes".
  assert.match(intakeRoute, /notes: z\.string\(\)\.max\(8000\)\.optional\(\)/)
  assert.match(intakeRoute, /const rawNotes = \(notes \|\| context \|\| ''\)\.trim\(\)/)
  assert.match(intakeRoute, /rawNotes\.length < 20/)
})

test('favorites: localStorage helpers for favorites, compare, buyer profile', () => {
  assert.match(favLib, /getFavorites/)
  assert.match(favLib, /toggleFavorite/)
  assert.match(favLib, /getCompare/)
  assert.match(favLib, /toggleCompare/)
  assert.match(favLib, /COMPARE_MAX = 3/)
  assert.match(favLib, /getBuyerProfile/)
  assert.match(favLib, /saveBuyerProfile/)
  assert.match(favLib, /localStorage/)
})

test('favorites: buyer profile defaults are sensible', () => {
  assert.match(favLib, /DEFAULT_PROFILE/)
  assert.match(favLib, /absentee_preferred: false/)
  assert.match(favLib, /franchise_ok: true/)
})

test('match score: deterministic zero-token engine scores 0-100', () => {
  assert.match(matchLib, /scoreListingMatch/)
  assert.match(matchLib, /score: number/)
  assert.match(matchLib, /reasons: string\[\]/)
  assert.match(matchLib, /industry fits you/)
  assert.match(matchLib, /within your budget/)
  assert.match(matchLib, /Math\.max\(0, Math\.min\(100, points\)\)/)
  assert.match(matchLib, /Pure, deterministic, zero tokens/)
  assert.doesNotMatch(matchLib, /deepseek|claude|anthropic|openai/i)
})

test('match score: score bands label fit quality', () => {
  assert.match(matchLib, /matchBand/)
  assert.match(matchLib, /Excellent fit/)
  assert.match(matchLib, /Good fit/)
  assert.match(matchLib, /Possible fit/)
  assert.match(matchLib, /Weak fit/)
})

test('card: favorite heart, compare toggle, and match score render', () => {
  assert.match(card, /toggleFavorite/)
  assert.match(card, /toggleCompare/)
  assert.match(card, /scoreListingMatch/)
  assert.match(card, /matchBand/)
  assert.match(card, /♡|♥/)
  assert.match(card, /⚖/)
  assert.match(card, /concord-match-profile-updated|getBuyerProfile/)
})

test('favorites page: renders saved listings with remove', () => {
  assert.match(favoritesPage, /Favorites/)
  assert.match(favoritesPage, /getFavorites/)
  assert.match(favoritesPage, /toggleFavorite/)
  assert.match(favoritesPage, /No favorites yet/)
  assert.match(favoritesPage, /Remove/)
})

test('compare page: side-by-side table with key metrics', () => {
  assert.match(comparePage, /Compare Businesses/)
  assert.match(comparePage, /getCompare/)
  assert.match(comparePage, /EBITDA/)
  assert.match(comparePage, /Annual Revenue/)
  assert.match(comparePage, /Pricing/)
  assert.match(comparePage, /Absentee/)
  assert.match(comparePage, /Nothing to compare yet/)
})

test('saved alerts: accountless email capture posts to public notify API', () => {
  assert.match(alertComp, /Get alerts for this search/)
  assert.match(alertComp, /\/api\/public\/notify/)
  assert.match(alertComp, /criteria/)
  assert.match(alertComp, /max_price/)
  assert.match(alertComp, /industries/)
  assert.match(alertComp, /No account needed/)
})

test('match profile: panel saves buyer profile for scoring', () => {
  assert.match(profilePanel, /AI match scores/)
  assert.match(profilePanel, /saveBuyerProfile/)
  assert.match(profilePanel, /clearBuyerProfile/)
  assert.match(profilePanel, /Max price/)
  assert.match(profilePanel, /Min SDE/)
  assert.match(profilePanel, /concord-match-profile-updated/)
})

test('listings page: wires alert + match profile panels', () => {
  assert.match(listingsPage, /SearchListingsClient/)
  assert.match(searchClient, /SavedSearchAlert/)
  assert.match(searchClient, /MatchProfilePanel/)
})

test('public nav: exposes Saved and Compare links', () => {
  assert.match(nav, /\/marketplace\/favorites/)
  assert.match(nav, /\/marketplace\/compare/)
})
