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
