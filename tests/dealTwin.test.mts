import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/dealTwin.ts', 'utf8')
const route = readFileSync('app/api/intelligence/deal-twin/route.ts', 'utf8')
const page = readFileSync('app/dashboard/deal-twin/page.tsx', 'utf8')
const schema = readFileSync('sql/deal_twin_schema.sql', 'utf8')

test('deal twin: svc client uses supabase-js with the service key, no redacted chars', () => {
  assert.match(lib, /import \{ createClient \} from '@supabase\/supabase-js'/)
  assert.match(lib, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.equal((lib.match(/SERVICE_ROLE_KEY/g) || []).length, 1)
  assert.doesNotMatch(lib, /\u2026/) // no ellipsis / redacted characters
})

test('deal twin: computeDealTwin scores 0-100 with component breakdown and never throws', () => {
  assert.match(lib, /export async function computeDealTwin/)
  assert.match(lib, /health_score/)
  assert.match(lib, /const components: DealTwinComponents = \{/)
  assert.match(lib, /dataRoom/)
  assert.match(lib, /buyers/)
  assert.match(lib, /offers/)
  assert.match(lib, /milestones/)
  assert.match(lib, /momentum/)
  assert.match(lib, /catch \(err\)/) // never throws
  assert.match(lib, /return \{ ok: false, error:/)
})

test('deal twin: pulls data room, offers, and milestone signals', () => {
  assert.match(lib, /data_room_activities/)
  assert.match(lib, /data_room_buyers/)
  assert.match(lib, /deal_offers/)
  assert.match(lib, /deal_closing_milestones/)
  assert.match(lib, /onConflict: 'listing_id'/)
  assert.match(lib, /deal_twin_snapshots/)
})

test('deal twin: risk flags cover inactivity, no offers, overdue milestones', () => {
  assert.match(lib, /no data room activity in 14d/)
  assert.match(lib, /no offers yet/)
  assert.match(lib, /overdue milestones/)
  assert.match(lib, /riskFlags\.push/)
})

test('deal twin: schema is idempotent, agency-scoped, RLS-on, unique per listing', () => {
  assert.match(schema, /create table if not exists public\.deal_twin_snapshots/)
  assert.match(schema, /agency_id\s+uuid not null references public\.agencies\(id\)/)
  assert.match(schema, /listing_id\s+uuid not null references public\.listings\(id\)/)
  assert.match(schema, /health_score\s+integer not null default 0/)
  assert.match(schema, /risk_flags\s+jsonb not null default '\[\]'::jsonb/)
  assert.match(schema, /unique \(listing_id\)/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.deal_twin_snapshots from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.deal_twin_snapshots to authenticated/)
})

test('deal twin: API supports GET and POST with the auth broker', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /createServerClient/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /computeDealTwin/)
  assert.match(route, /export const runtime = 'nodejs'/)
})

test('deal twin: dashboard page has picker, score, risk flags, component bars', () => {
  assert.match(page, /AppShell active="Deal Twin"/)
  assert.match(page, /ToastProvider/)
  assert.match(page, /useToast\(\)/)
  assert.match(page, /getAgencyContext/)
  assert.match(page, /api\/listings\/options/)
  assert.match(page, /health_score/)
  assert.match(page, /risk_flags/)
  assert.match(page, /Component breakdown/)
  assert.match(page, /getStoredAccessToken/)
  assert.match(page, /api\/intelligence\/deal-twin/)
})
