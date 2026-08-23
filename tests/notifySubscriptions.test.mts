import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/notifySubscriptions.ts', 'utf8')
const route = readFileSync('app/api/public/notify/route.ts', 'utf8')
const schema = readFileSync('sql/deal_notify_schema.sql', 'utf8')
const email = readFileSync('lib/email.ts', 'utf8')

test('notify: public capture subscribes via service-role client', () => {
  assert.match(lib, /export async function subscribe/)
  assert.match(lib, /createClient\(SUPABASE_URL, SERVICE_KEY/)
  assert.match(lib, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(lib, /SERVICE_ROLE_KEY/)
  assert.match(lib, /deal_notify_subscriptions/)
  assert.match(lib, /\.insert\(/)
})

test('notify: subscribe validates email before inserting', () => {
  assert.match(lib, /EMAIL_RE/)
  assert.match(lib, /@[^\s@]+\.[^\s@]+/)
  assert.match(lib, /A valid email is required/)
})

test('notify: matcher requires industry overlap, max_price, min_sde', () => {
  assert.match(lib, /export function matchesNotifyCriteria/)
  assert.match(lib, /export async function matchPublicSubscriptions/)
  assert.match(lib, /industriesOverlap/)
  assert.match(lib, /asking_price > criteria\.max_price/)
  assert.match(lib, /sde < criteria\.min_sde/)
})

test('notify: match fires deal_notification emails', () => {
  assert.match(lib, /notify\('deal_notification', sub\.email/)
  assert.match(lib, /businessName: listing\.business_name/)
  assert.match(lib, /price: listing\.asking_price/)
  assert.match(lib, /Never throws/)
})

test('notify: schema is idempotent, RLS-on, agency-scoped', () => {
  assert.match(schema, /create table if not exists public\.deal_notify_subscriptions/)
  assert.match(schema, /agency_id uuid references public\.agencies\(id\) on delete cascade/)
  assert.match(schema, /email text not null/)
  assert.match(schema, /criteria jsonb not null default '{}'::jsonb/)
  assert.match(schema, /active boolean not null default true/)
  assert.match(schema, /deal_notify_subscriptions \(agency_id, email\)/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.deal_notify_subscriptions from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.deal_notify_subscriptions to authenticated/)
  assert.match(schema, /^begin;/m)
  assert.match(schema, /^commit;/m)
})

test('notify: route has public POST and authed GET', () => {
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function GET/)
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /agencyId query param/)
  assert.match(route, /subscribe\(/)
  assert.match(route, /deal_notify_subscriptions/)
})

test('notify: email system supports deal_notification kind', () => {
  assert.match(email, /'deal_notification'/)
  assert.match(email, /dealNotification\(/)
})
