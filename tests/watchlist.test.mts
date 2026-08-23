import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/watchlist.ts', 'utf8')
const route = readFileSync('app/api/marketplace/watchlist/route.ts', 'utf8')
const page = readFileSync('app/dashboard/watchlist/page.tsx', 'utf8')
const schema = readFileSync('sql/watchlist_schema.sql', 'utf8')
const email = readFileSync('lib/email.ts', 'utf8')
const review = readFileSync('app/api/listings/review/route.ts', 'utf8')

test('watchlist: scoring has industry hard requirement and an alert floor', () => {
  assert.match(lib, /export function scoreWatchlistCriteria/)
  assert.match(lib, /return null/) // hard requirement rejection
  assert.match(lib, /if \(points < 40\) return null/) // alert floor
  assert.match(lib, /reasons\.push\('industry'\)/)
})

test('watchlist: scoring covers price, location, revenue, SDE, keywords', () => {
  for (const token of ['price', 'location', 'revenue', 'sde', 'keywords']) {
    assert.match(lib, new RegExp(token))
  }
  assert.match(lib, /criteria\.max_price != null && listing\.asking_price > criteria\.max_price/)
})

test('watchlist: engine reuses buyer_match_events and queues match alerts', () => {
  assert.match(lib, /runWatchlistMatching/)
  assert.match(lib, /buyer_match_events/)
  assert.match(lib, /notify\('match_alert'/)
  assert.match(lib, /onConflict: 'buyer_profile_id,listing_id'/)
  assert.match(lib, /fetchActiveSearches/)
})

test('watchlist: schema is idempotent, agency-scoped, and RLS-on', () => {
  assert.match(schema, /create table if not exists public\.buyer_watchlist_searches/)
  assert.match(schema, /create table if not exists public\.buyer_bookmarked_listings/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /unique \(buyer_profile_id, listing_id\)/)
  assert.match(schema, /revoke all on public\.buyer_watchlist_searches from anon/)
})

test('watchlist: email system has a match_alert template', () => {
  assert.match(email, /'match_alert'/)
  assert.match(email, /matchAlert\(/)
  assert.match(email, /New match for/)
})

test('watchlist: API supports GET/POST/PATCH/DELETE with auth', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function PATCH/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /buyer_watchlist_searches/)
  assert.match(route, /buyer_bookmarked_listings/)
})

test('watchlist: dashboard page renders saved searches, alerts, bookmarks', () => {
  assert.match(page, /Deal Alerts & Watchlist/)
  assert.match(page, /Create a saved search/)
  assert.match(page, /New matches/)
  assert.match(page, /Bookmarked listings/)
  assert.match(page, /\/api\/marketplace\/watchlist/)
})

test('watchlist: listing approval fires watchlist matching', () => {
  assert.match(review, /runWatchlistMatching/)
  assert.match(review, /action === 'approve'/)
})
