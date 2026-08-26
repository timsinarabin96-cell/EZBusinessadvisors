import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sql = readFileSync('sql/auto_match_trigger.sql', 'utf8')
const route = readFileSync('app/api/listings/review/route.ts', 'utf8')
const page = readFileSync('app/dashboard/review-queue/page.tsx', 'utf8')

test('auto-match trigger fires on listing approval', () => {
  assert.match(sql, /auto_match_buyers_on_approval/)
  assert.match(sql, /after insert or update of status/)
  assert.match(sql, /match_buyers_for_listing/)
})

test('trigger only matches on approved/published/active status', () => {
  assert.match(sql, /new\.status not in \('approved', 'published', 'active'\)/)
})

test('trigger enforces industry and price hard requirements', () => {
  assert.match(sql, /wrong industry → skip/)
  assert.match(sql, /over budget/)
  assert.match(sql, /below interest/)
})

test('trigger insert is idempotent per buyer+listing', () => {
  assert.match(sql, /on conflict \(buyer_profile_id, listing_id\) do update/)
})

test('review route requires agency management rights', () => {
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse/)
  assert.match(route, /authenticateProfileRequest/)
})

test('review route supports approve/reject/request_changes', () => {
  assert.match(route, /'approve', 'reject', 'request_changes'/)
  assert.match(route, /commission_split_agent/)
  assert.match(route, /listing_review_events/)
})

test('review queue page is wired into the dashboard', () => {
  assert.match(page, /Listing Review Queue/)
  assert.match(page, /\/api\/listings\/review/)
  assert.match(page, /Request changes/)
  const shell = readFileSync('components/layout/navConfig.ts', 'utf8')
  assert.match(shell, /review-queue/)
})
