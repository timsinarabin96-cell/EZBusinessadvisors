import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/comps_schema.sql', 'utf8')
const lib = readFileSync('lib/comps.ts', 'utf8')
const route = readFileSync('app/api/comps/route.ts', 'utf8')
const page = readFileSync('components/valuation/CompsPanel.tsx', 'utf8')

test('comps: schema is idempotent, agency-scoped, RLS-on', () => {
  assert.match(schema, /create table if not exists public\.sold_comps/)
  assert.match(schema, /multiple numeric\(6,2\)/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.sold_comps from anon/)
})

test('comps: lib adds comps with auto-multiple and aggregates by industry', () => {
  assert.match(lib, /export async function addComp/)
  assert.match(lib, /sale_price \/ input\.sde/)
  assert.match(lib, /export async function listComps/)
  assert.match(lib, /export async function multiplesByIndustry/)
  assert.match(lib, /avg_multiple/)
})

test('comps: API lists, summarizes, and creates with broker gating', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /summary=multiples/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /addComp/)
})

test('comps: dashboard page shows multiples grid and add form', () => {
  assert.match(page, /Comps Database/)
  assert.match(page, /Multiples by industry/)
  assert.match(page, /Add a comp/)
  assert.match(page, /Sold deals/)
  assert.match(page, /\/api\/comps/)
})
