import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/sellerReadiness.ts', 'utf8')
const route = readFileSync('app/api/intelligence/readiness/route.ts', 'utf8')
const page = readFileSync('app/dashboard/readiness/page.tsx', 'utf8')
const schema = readFileSync('sql/seller_readiness_schema.sql', 'utf8')

test('seller readiness: computeReadiness never throws and returns a result envelope', () => {
  assert.match(lib, /export async function computeReadiness/)
  assert.match(lib, /catch \(err\)/) // never throws
  assert.match(lib, /return \{ ok: false, error:/)
  assert.match(lib, /readiness_score/)
})

test('seller readiness: checks financials, CIM/BOV, data room, price, approval, compliance', () => {
  assert.match(lib, /financial_documents/)
  assert.match(lib, /recast_done/)
  assert.match(lib, /cim_versions/)
  assert.match(lib, /bov_versions/)
  assert.match(lib, /data_room_files/)
  assert.match(lib, /asking_price/)
  assert.match(lib, /approved_at/)
  assert.match(lib, /compliance_status/)
})

test('seller readiness: component breakdown and canonical action items', () => {
  assert.match(lib, /const components: ReadinessComponents = \{/)
  assert.match(lib, /financials/)
  assert.match(lib, /cim/)
  assert.match(lib, /bov/)
  assert.match(lib, /dataRoom/)
  assert.match(lib, /price/)
  assert.match(lib, /approval/)
  assert.match(lib, /compliance/)
  for (const item of [
    'Recast financials',
    'Generate CIM',
    'Populate data room',
    'Set asking price',
    'Get written seller approval',
    'Complete compliance review',
  ]) {
    assert.match(lib, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('seller readiness: valuation estimate and idempotent upsert', () => {
  assert.match(lib, /valuation_estimate/)
  assert.match(lib, /onConflict: 'listing_id'/)
  assert.match(lib, /seller_readiness/)
})

test('seller readiness: schema is idempotent, agency-scoped, RLS-on, unique per listing', () => {
  assert.match(schema, /create table if not exists public\.seller_readiness/)
  assert.match(schema, /agency_id\s+uuid not null references public\.agencies\(id\)/)
  assert.match(schema, /listing_id\s+uuid not null references public\.listings\(id\)/)
  assert.match(schema, /readiness_score\s+integer not null default 0/)
  assert.match(schema, /valuation_estimate\s+numeric\(14,2\)/)
  assert.match(schema, /unique \(listing_id\)/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.seller_readiness from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.seller_readiness to authenticated/)
})

test('seller readiness: API supports GET and POST with the auth broker', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /createServerClient/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /computeReadiness/)
  assert.match(route, /export const runtime = 'nodejs'/)
})

test('seller readiness: dashboard page has picker, score, action items, estimate', () => {
  assert.match(page, /AppShell active="Seller Readiness"/)
  assert.match(page, /ToastProvider/)
  assert.match(page, /useToast\(\)/)
  assert.match(page, /getAgencyContext/)
  assert.match(page, /api\/listings\/options/)
  assert.match(page, /api\/intelligence\/readiness/)
  assert.match(page, /Action items/)
  assert.match(page, /valuation_estimate/)
  assert.match(page, /sb-access-token/)
})
