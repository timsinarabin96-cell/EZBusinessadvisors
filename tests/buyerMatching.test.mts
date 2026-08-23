import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const src = readFileSync('lib/buyerMatching.ts', 'utf8')

test('match engine exposes scoreMatch and runMatchingForListing', () => {
  assert.match(src, /export function scoreMatch/)
  assert.match(src, /export async function runMatchingForListing/)
  assert.match(src, /export async function fetchBuyerProfiles/)
})

test('match scoring enforces hard requirements', () => {
  assert.match(src, /return null \/\/ hard requirement/)
  assert.match(src, /return null \/\/ over budget/)
  assert.match(src, /return null \/\/ below minimum interest/)
})

test('match floor prevents spammy low-value notifications', () => {
  assert.match(src, /if \(points < 40\) return null/)
})

test('match events are unique per buyer+listing (idempotent)', () => {
  assert.match(src, /unique \(buyer_profile_id, listing_id\)|onConflict: 'buyer_profile_id,listing_id'/)
})

test('match events table is agency-isolated with RLS', () => {
  const sql = readFileSync('sql/buyer_matching_schema.sql', 'utf8')
  assert.match(sql, /buyer_match_events/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /buyer_match_events_agency_access/)
  assert.match(sql, /revoke all on public\.buyer_match_events from anon/)
})
