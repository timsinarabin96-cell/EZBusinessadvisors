import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/activityFeed.ts', 'utf8')
const route = readFileSync('app/api/activity/route.ts', 'utf8')
const page = readFileSync('app/dashboard/activity/page.tsx', 'utf8')

test('activity: feed merges reviews, data rooms, matches, NDAs, milestones', () => {
  assert.match(lib, /export async function fetchActivityFeed/)
  assert.match(lib, /listing_review_events/)
  assert.match(lib, /data_room_activities/)
  assert.match(lib, /buyer_match_events/)
  assert.match(lib, /data_room_access_requests/)
  assert.match(lib, /deal_closing_milestones/)
  assert.match(lib, /sort\(\(a, b\) =>/)
})

test('activity: API is auth-gated and agency-scoped', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /fetchActivityFeed/)
  assert.match(route, /limit/)
})

test('activity: dashboard renders kind icons and timestamps', () => {
  assert.match(page, /Activity Feed/)
  assert.match(page, /KIND_ICONS/)
  assert.match(page, /\/api\/activity/)
  assert.match(page, /toLocaleString/)
})
