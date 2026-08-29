import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/commissions_schema.sql', 'utf8')
const lib = readFileSync('lib/commissions.ts', 'utf8')
const route = readFileSync('app/api/commissions/route.ts', 'utf8')
const page = readFileSync('components/admin/CommissionsPanel.tsx', 'utf8')

test('commissions: schema defines commission_records with status lifecycle', () => {
  assert.match(schema, /create table if not exists public\.commission_records/)
  assert.match(schema, /agency_id uuid not null references public\.agencies\(id\) on delete cascade/)
  assert.match(schema, /listing_id uuid references public\.listings\(id\) on delete set null/)
  assert.match(schema, /deal_id uuid references public\.deals\(id\) on delete set null/)
  assert.match(schema, /agent_profile_id uuid references public\.profiles\(id\) on delete set null/)
  assert.match(schema, /amount numeric\(14,2\)/)
  assert.match(schema, /commission_pct numeric\(5,2\)/)
  assert.match(schema, /status text not null default 'pending' check \(status in \('pending','approved','paid'\)\)/)
  assert.match(schema, /paid_at timestamptz/)
  assert.match(schema, /begin;/)
  assert.match(schema, /commit;/)
})

test('commissions: schema is agency-scoped and RLS-on with locked-down grants', () => {
  assert.match(schema, /commission_records_agency_status_idx/)
  assert.match(schema, /\(agency_id, status, created_at desc\)/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.commission_records from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.commission_records to authenticated/)
})

test('commissions: lib exposes record/update/list/export with a service-role client', () => {
  assert.match(lib, /import \{ createClient \} from '@supabase\/supabase-js'/)
  assert.match(lib, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(lib, /export async function recordCommission\(/)
  assert.match(lib, /export async function updateCommissionStatus\(/)
  assert.match(lib, /export async function listCommissions\(/)
  assert.match(lib, /export async function exportCommissionsCsv\(/)
  assert.match(lib, /COMMISSION_STATUSES/)
})

test('commissions: lib validates amount and stamps paid_at on paid', () => {
  assert.match(lib, /A positive amount is required/)
  assert.match(lib, /status must be pending, approved, or paid/)
  assert.match(lib, /status === 'paid'/)
  assert.match(lib, /paid_at = new Date\(\)\.toISOString\(\)/)
  assert.match(lib, /commission record not found/)
})

test('commissions: lib joins listing business name and agent name', () => {
  assert.match(lib, /listings\(business_name\)/)
  assert.match(lib, /profiles\(full_name\)/)
  assert.match(lib, /\.eq\('agency_id', agencyId\)/)
  assert.match(lib, /\.order\('created_at', \{ ascending: false \}\)/)
})

test('commissions: CSV export has the exact headers and escaping', () => {
  assert.match(lib, /\['business', 'agent', 'amount', 'pct', 'status', 'paid_at', 'created_at'\]/)
  assert.match(lib, /csvField/)
  assert.match(lib, /\.replace\(\/"\//)
  assert.match(lib, /\.join\('\\n'\)/)
})

test('commissions: API supports GET (json + csv), POST, PATCH with broker auth', () => {
  assert.match(route, /export async function GET\(req: NextRequest\)/)
  assert.match(route, /export async function POST\(req: NextRequest\)/)
  assert.match(route, /export async function PATCH\(req: NextRequest\)/)
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /authenticateProfileRequest\(req\)/)
  assert.match(route, /canManageAgency\(auth, agencyId\)/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /unauthorizedResponse\(\)/)
})

test('commissions: API CSV path returns text/csv and wires the lib', () => {
  assert.match(route, /format === 'csv'/)
  assert.match(route, /exportCommissionsCsv\(agencyId\)/)
  assert.match(route, /text\/csv; charset=utf-8/)
  assert.match(route, /commissions\.csv/)
  assert.match(route, /listCommissions\(agencyId, status\)/)
  assert.match(route, /recordCommission\(\{/)
  assert.match(route, /updateCommissionStatus\(id, status\)/)
})

test('commissions: dashboard page renders form, list, and CSV export', () => {
  assert.match(page, /'use client'/)
  assert.match(page, /useToast\(\)/)
  assert.match(page, /getAgencyContext\(\)/)
  assert.match(page, /Record a commission/)
  assert.match(page, /MoneyInput/)
  assert.match(page, /Commission %/)
  assert.match(page, /Export CSV/)
  assert.match(page, /Commissions/)
})

test('commissions: dashboard downloads CSV as a client-side blob', () => {
  assert.match(page, /\/api\/commissions/)
  assert.match(page, /getStoredAccessToken/)
  assert.match(page, /&format=csv/)
  assert.match(page, /URL\.createObjectURL\(blob\)/)
  assert.match(page, /a\.download = 'commissions\.csv'/)
  assert.match(page, /STATUS_FLOW/)
  assert.match(page, /Mark \{next\}/)
})
