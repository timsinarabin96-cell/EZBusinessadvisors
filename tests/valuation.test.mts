import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/valuation.ts', 'utf8')
const route = readFileSync('app/api/intelligence/valuation/route.ts', 'utf8')
const page = readFileSync('components/valuation/ValuationEnginePanel.tsx', 'utf8')
const schema = readFileSync('sql/valuation_schema.sql', 'utf8')

test('valuation: service client uses the service-role key', () => {
  assert.match(lib, /from '@supabase\/supabase-js'/) // createClient import
  assert.match(lib, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(lib, /persistSession: false/)
})

test('valuation: estimateValuation fetches listings financials and inserts a row', () => {
  assert.match(lib, /export async function estimateValuation/)
  assert.match(lib, /\.from\('listings'\)/)
  assert.match(lib, /annual_revenue/)
  assert.match(lib, /sde/)
  assert.match(lib, /\.from\('valuation_estimates'\)/)
  assert.match(lib, /estimate_min/)
  assert.match(lib, /estimate_max/)
  assert.match(lib, /midpoint/)
})

test('valuation: industry multiple table defaults to 2.5-3.5x SDE with a static map', () => {
  assert.match(lib, /INDUSTRY_MULTIPLES/)
  assert.match(lib, /export function multipleForIndustry/)
  assert.match(lib, /DEFAULT_MULTIPLE/)
  assert.match(lib, /min: 2\.5, max: 3\.5/)
  assert.match(lib, /software/)
  assert.match(lib, /manufacturing/)
})

test('valuation: revenue cross-check uses 0.8-1.2x and SBA-style margin adjustments', () => {
  assert.match(lib, /revenue \* 0\.8/)
  assert.match(lib, /revenue \* 1\.2/)
  assert.match(lib, /export function marginAdjustment/)
  assert.match(lib, /margin/)
  assert.match(lib, /sde \/ revenue/)
})

test('valuation: computeValuation returns min/max/midpoint with multiples + inputs', () => {
  assert.match(lib, /export function computeValuation/)
  assert.match(lib, /estimate_min: min/)
  assert.match(lib, /estimate_max: max/)
  assert.match(lib, /midpoint: Math\.round\(\(min \+ max\) \/ 2\)/)
  assert.match(lib, /multiples:/)
  assert.match(lib, /inputs:/)
  assert.match(lib, /method:/)
})

test('valuation: engine never throws (try/catch) and lists by agency or listing', () => {
  assert.match(lib, /try \{/)
  assert.match(lib, /catch \(err\)/)
  assert.match(lib, /export async function listValuations/)
  assert.match(lib, /\.eq\('agency_id', agencyId\)/)
  assert.match(lib, /\.eq\('listing_id', listingId\)/)
})

test('valuation: schema is idempotent, agency-scoped, RLS-on with numeric range', () => {
  assert.match(schema, /create table if not exists public\.valuation_estimates/)
  assert.match(schema, /agency_id\s+uuid not null references public\.agencies\(id\) on delete cascade/)
  assert.match(schema, /listing_id\s+uuid references public\.listings\(id\) on delete set null/)
  assert.match(schema, /seller_lead_id\s+uuid references public\.seller_leads\(id\) on delete set null/)
  assert.match(schema, /estimate_min\s+numeric\(14, 2\)/)
  assert.match(schema, /estimate_max\s+numeric\(14, 2\)/)
  assert.match(schema, /midpoint\s+numeric\(14, 2\)/)
  assert.match(schema, /multiples\s+jsonb not null default '\{\}'::jsonb/)
  assert.match(schema, /inputs\s+jsonb not null default '\{\}'::jsonb/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.valuation_estimates from anon/)
})

test('valuation: API supports GET list and POST estimate with auth broker', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /estimateValuation/)
  assert.match(route, /listValuations/)
})

test('valuation: dashboard page picks listings and shows range + midpoint + breakdown', () => {
  assert.match(page, /useToast\(\)/)
  assert.match(page, /getAgencyContext/)
  assert.match(page, /getStoredAccessToken/)
  assert.match(page, /\/api\/listings\/options\?agencyId=/)
  assert.match(page, /\/api\/intelligence\/valuation/)
  assert.match(page, /midpoint/)
  assert.match(page, /SDE multiple/)
  assert.match(page, /Revenue cross-check/)
})
