import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/loi_schema.sql', 'utf8')
const lib = readFileSync('lib/loi.ts', 'utf8')
// renderLoiHtml lives in the dependency-free module (keeps nodemailer out of
// the client bundle); loi.ts re-exports it for server callers.
const render = readFileSync('lib/loiRender.ts', 'utf8')
const route = readFileSync('app/api/loi/route.ts', 'utf8')
const page = readFileSync('components/dealTerms/LoiLab.tsx', 'utf8')
const email = readFileSync('lib/email.ts', 'utf8')

test('loi: schema is idempotent, agency-scoped, RLS-on', () => {
  assert.match(schema, /create table if not exists public\.letters_of_intent/)
  assert.match(schema, /content jsonb not null default '{}'::jsonb/)
  assert.match(schema, /status text not null default 'draft'/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.letters_of_intent from anon/)
})

test('loi: builder produces full term sheet content', () => {
  assert.match(lib, /export async function buildLoiContent/)
  assert.match(lib, /purchase_price: offer\.purchase_price/)
  assert.match(lib, /cash_at_closing/)
  assert.match(lib, /seller_note/)
  assert.match(lib, /earnout_amount/)
  assert.match(lib, /financing_contingency/)
  assert.match(lib, /diligence_days/)
  assert.match(lib, /exclusivity_days/)
  assert.match(lib, /expiry_date/)
})

test('loi: renders a printable letter with terms + signature blocks', () => {
  assert.match(render, /export function renderLoiHtml/)
  assert.match(render, /Letter of Intent/)
  assert.match(render, /Purchase price/)
  assert.match(render, /Due diligence period/)
  assert.match(render, /Signed: ____________________/)
  assert.match(render, /This Letter of Intent is non-binding/)
})

test('loi: persists idempotently per offer and lists per agency', () => {
  assert.match(lib, /saveLoi/)
  assert.match(lib, /onConflict: 'offer_id'/)
  assert.match(lib, /listLois/)
  assert.match(lib, /notifyLoiGenerated/)
})

test('loi: API accepts only accepted offers and lists for agency', () => {
  assert.match(route, /offer\.status !== 'accepted'/)
  assert.match(route, /Only accepted offers can generate an LOI/)
  assert.match(route, /export async function GET/)
  assert.match(route, /listLois/)
  assert.match(route, /notifyLoiGenerated/)
})

test('loi: dashboard page has generate UI + LOI list', () => {
  assert.match(page, /LOI Generator/)
  assert.match(page, /Generate from accepted offer/)
  assert.match(page, /Generate LOI/)
  assert.match(page, /Generated LOIs/)
  assert.match(page, /\/api\/loi/)
})

test('loi: email template for generated LOI exists', () => {
  assert.match(email, /'loi_generated'/)
  assert.match(email, /loiGenerated\(/)
  assert.match(email, /LOI generated for/)
})
