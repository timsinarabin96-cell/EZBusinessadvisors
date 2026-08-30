import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/referrals_schema.sql', 'utf8')
const lib = readFileSync('lib/referrals.ts', 'utf8')
const route = readFileSync('app/api/referrals/route.ts', 'utf8')
const page = readFileSync('components/network/ReferralsPanel.tsx', 'utf8')

test('referrals: schema is idempotent, agency-scoped, and RLS-on', () => {
  assert.match(schema, /create table if not exists public\.referrals/)
  assert.match(schema, /agency_id uuid not null references public\.agencies\(id\) on delete cascade/)
  assert.match(schema, /referral_type text not null default 'buyer' check \(referral_type in \('buyer','seller'\)\)/)
  assert.match(schema, /status text not null default 'new' check \(status in \('new','contacted','converted','paid'\)\)/)
  assert.match(schema, /commission_pct numeric\(5,2\)/)
  assert.match(schema, /converted_at timestamptz/)
  assert.match(schema, /begin;/)
  assert.match(schema, /commit;/)
})

test('referrals: schema indexes the agency funnel and grants are locked down', () => {
  assert.match(schema, /referrals_agency_status_idx/)
  assert.match(schema, /\(agency_id, status, created_at desc\)/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.referrals from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.referrals to authenticated/)
})

test('referrals: lib exposes CRUD with a service-role client and never throws', () => {
  assert.match(lib, /import \{ createClient \} from '@supabase\/supabase-js'/)
  assert.match(lib, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(lib, /createClient\(SUPABASE_URL, SERVICE_KEY, \{ auth: \{ persistSession: false \} \}\)/)
  assert.match(lib, /export async function createReferral/)
  assert.match(lib, /export async function updateReferralStatus\(/)
  assert.match(lib, /export async function listReferrals\(/)
  assert.match(lib, /REFERRAL_STATUSES/)
  assert.match(lib, /converted_at/)
})

test('referrals: lib validates input and advances status through the funnel', () => {
  assert.match(lib, /A valid referrer email is required/)
  assert.match(lib, /status must be new, contacted, converted, or paid/)
  assert.match(lib, /status === 'converted'/)
  assert.match(lib, /\.order\('created_at', \{ ascending: false \}\)/)
})

test('referrals: API is an authenticated broker broker endpoint', () => {
  assert.match(route, /export async function GET\(req: NextRequest\)/)
  assert.match(route, /export async function POST\(req: NextRequest\)/)
  assert.match(route, /export async function PATCH\(req: NextRequest\)/)
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /authenticateProfileRequest\(req\)/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /canManageAgency\(auth, agencyId\)/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /agencyId query param is required/)
})

test('referrals: API wires the lib list/create/update functions', () => {
  assert.match(route, /listReferrals\(agencyId, status\)/)
  assert.match(route, /createReferral\(\{/)
  assert.match(route, /updateReferralStatus\(id, status,/)
  assert.match(route, /convertedAt/)
})

test('referrals: dashboard page renders form + list with status pills and advance buttons', () => {
  assert.match(page, /'use client'/)
  assert.match(page, /useToast\(\)/)
  assert.match(page, /getAgencyContext\(\)/)
  assert.match(page, /Log a new referral/)
  assert.match(page, /Referrer name \*/)
  assert.match(page, /Referrer email \*/)
  assert.match(page, /Commission %/)
  assert.match(page, /Referral Program/)
})

test('referrals: dashboard fetches with authenticated session and advances status', () => {
  assert.match(page, /\/api\/referrals/)
  assert.match(page, /authenticatedFetch/)
  assert.match(page, /STATUS_FLOW/)
  assert.match(page, /Mark \{next\}/)
  assert.match(page, /next === 'converted'/)
})
