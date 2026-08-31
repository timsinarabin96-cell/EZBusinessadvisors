import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/proofOfFunds.ts', 'utf8')
const schema = readFileSync('sql/proof_of_funds_schema.sql', 'utf8')

test('proof-of-funds: submit resolves agency from listing and inserts', () => {
  assert.match(lib, /export async function submitPoF/)
  assert.match(lib, /from\('listings'\)\.select\('id, agency_id'\)/)
  assert.match(lib, /from\('proof_of_funds'\)/)
  assert.match(lib, /\.insert\(/)
  assert.match(lib, /requester_email/)
  assert.match(lib, /status: 'pending'/)
})

test('proof-of-funds: submit validates email', () => {
  assert.match(lib, /EMAIL_RE/)
  assert.match(lib, /A valid email is required/)
  assert.match(lib, /listingId is required/)
})

test('proof-of-funds: review stamps status, reviewer, timestamp', () => {
  assert.match(lib, /export async function reviewPoF/)
  assert.match(lib, /'verified' | 'rejected'/)
  assert.match(lib, /reviewed_by: reviewerId/)
  assert.match(lib, /reviewed_at: new Date\(\)\.toISOString\(\)/)
})

test('proof-of-funds: list filters by agency and optional status', () => {
  assert.match(lib, /export async function listPoF/)
  assert.match(lib, /\.eq\('agency_id', agencyId\)/)
  assert.match(lib, /\.eq\('status', status\)/)
})

test('proof-of-funds: schema is idempotent with status check and RLS', () => {
  assert.match(schema, /create table if not exists public\.proof_of_funds/)
  assert.match(schema, /agency_id uuid not null references public\.agencies\(id\) on delete cascade/)
  assert.match(schema, /listing_id uuid not null references public\.listings\(id\) on delete cascade/)
  assert.match(schema, /requester_email text not null/)
  assert.match(schema, /amount numeric\(14,2\)/)
  assert.match(schema, /status text not null default 'pending' check \(status in \('pending','verified','rejected'\)\)/)
  assert.match(schema, /reviewed_by uuid references public\.profiles\(id\)/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.proof_of_funds from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.proof_of_funds to authenticated/)
  assert.match(schema, /^begin;/m)
  assert.match(schema, /^commit;/m)
})
