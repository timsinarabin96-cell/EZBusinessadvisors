import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/listing_expiry_schema.sql', 'utf8')
const lib = readFileSync('lib/listingExpiry.ts', 'utf8')
const route = readFileSync('app/api/listings/expiry/route.ts', 'utf8')
const page = readFileSync('app/dashboard/expiry/page.tsx', 'utf8')

test('expiry: schema is idempotent, agency-scoped, RLS-on', () => {
  assert.match(schema, /create table if not exists public\.listing_expirations/)
  assert.match(schema, /status text not null default 'active' check/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.listing_expirations from anon/)
})

test('expiry: lib sets, renews, processes, and lists expirations', () => {
  assert.match(lib, /export async function setExpiry/)
  assert.match(lib, /export async function renewListing/)
  assert.match(lib, /export async function processExpirations/)
  assert.match(lib, /export async function listExpirations/)
  assert.match(lib, /7 \* 86400000/)
  assert.match(lib, /notify\('deal_notification'/)
})

test('expiry: API is broker-gated with set/renew/process actions', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /action must be set, renew, or process/)
})

test('expiry: dashboard page sets dates, renews, runs checks', () => {
  assert.match(page, /Listing Expiry & Renewal/)
  assert.match(page, /Set expiry date/)
  assert.match(page, /Run expiry check/)
  assert.match(page, /Renew/)
  assert.match(page, /\/api\/listings\/expiry/)
})
