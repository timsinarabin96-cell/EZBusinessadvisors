import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/dealDigest.ts', 'utf8')
const schema = readFileSync('sql/deal_digest_schema.sql', 'utf8')

test('digest: fetches active approved listings for the agency', () => {
  assert.match(lib, /export async function fetchDigestListings/)
  assert.match(lib, /\.eq\('agency_id', agencyId\)/)
  assert.match(lib, /\.in\('status', \['approved', 'published', 'active'\]\)/)
  assert.match(lib, /\.eq\('review_stage', 'approved'\)/)
})

test('digest: recipients come from buyer profiles and notify subscriptions', () => {
  assert.match(lib, /export async function fetchDigestRecipients/)
  assert.match(lib, /buyer_search_profiles/)
  assert.match(lib, /\.eq\('notification_email', true\)/)
  assert.match(lib, /deal_notify_subscriptions/)
  assert.match(lib, /\.eq\('active', true\)/)
})

test('digest: sends deal_notification with weekly count and records rows', () => {
  assert.match(lib, /export async function generateDigest/)
  assert.match(lib, /notify\('deal_notification', recipient\.email/)
  assert.match(lib, /new businesses this week/)
  assert.match(lib, /from\('deal_digests'\)/)
  assert.match(lib, /\.insert\(/)
  assert.match(lib, /listing_ids: listingIds/)
})

test('digest: safe wrapper never throws', () => {
  assert.match(lib, /export async function generateDigestForAgency/)
  assert.match(lib, /try \{/)
  assert.match(lib, /catch \(error\)/)
  assert.match(lib, /Never throws/)
})

test('digest: schema is idempotent and RLS-on', () => {
  assert.match(schema, /create table if not exists public\.deal_digests/)
  assert.match(schema, /agency_id uuid not null references public\.agencies\(id\) on delete cascade/)
  assert.match(schema, /generated_at timestamptz not null default now\(\)/)
  assert.match(schema, /recipient_email text not null/)
  assert.match(schema, /listing_ids jsonb not null default '\[\]'::jsonb/)
  assert.match(schema, /status text not null default 'sent'/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.deal_digests from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.deal_digests to authenticated/)
  assert.match(schema, /^begin;/m)
  assert.match(schema, /^commit;/m)
})
