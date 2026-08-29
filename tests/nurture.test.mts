import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/nurture_schema.sql', 'utf8')
const lib = readFileSync('lib/nurture.ts', 'utf8')
const route = readFileSync('app/api/nurture/route.ts', 'utf8')
const page = readFileSync('components/marketing/panels/NurturePanel.tsx', 'utf8')

test('nurture: schema defines sequences + recipients with audience/status checks', () => {
  assert.match(schema, /create table if not exists public\.nurture_sequences/)
  assert.match(schema, /create table if not exists public\.nurture_recipients/)
  assert.match(schema, /audience text not null default 'buyer' check \(audience in \('buyer','seller'\)\)/)
  assert.match(schema, /status text not null default 'active' check \(status in \('active','completed','paused'\)\)/)
  assert.match(schema, /steps jsonb not null default '\[\]'::jsonb/)
  assert.match(schema, /current_step integer not null default 0/)
  assert.match(schema, /next_send_at timestamptz/)
  assert.match(schema, /begin;/)
  assert.match(schema, /commit;/)
})

test('nurture: schema is agency-scoped, cascades recipients, and is RLS-on', () => {
  assert.match(schema, /sequence_id uuid not null references public\.nurture_sequences\(id\) on delete cascade/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.nurture_sequences from anon/)
  assert.match(schema, /revoke all on public\.nurture_recipients from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.nurture_recipients to authenticated/)
})

test('nurture: default buyer sequence has the three drip steps', () => {
  assert.match(lib, /seedDefaultSequences/)
  assert.match(lib, /'Welcome & deal criteria'/)
  assert.match(lib, /'Curated listings for you'/)
  assert.match(lib, /'Buyer readiness check-in'/)
  assert.match(lib, /buyer: \{/)
  assert.match(lib, /name: 'Buyer nurture'/)
})

test('nurture: default seller sequence has the three drip steps', () => {
  assert.match(lib, /'Your business valuation'/)
  assert.match(lib, /'Seller readiness roadmap'/)
  assert.match(lib, /'Listing strategy call'/)
  assert.match(lib, /seller: \{/)
  assert.match(lib, /name: 'Seller nurture'/)
})

test('nurture: enroll validates email and writes an active recipient due now', () => {
  assert.match(lib, /export async function enroll\(/)
  assert.match(lib, /A valid email is required/)
  assert.match(lib, /sequence not found/)
  assert.match(lib, /next_send_at: new Date\(\)\.toISOString\(\)/)
  assert.match(lib, /status: 'active'/)
  assert.match(lib, /current_step: 0/)
})

test('nurture: advanceDueRecipients sends deal_notification and bumps/completes', () => {
  assert.match(lib, /export async function advanceDueRecipients\(/)
  assert.match(lib, /\.eq\('status', 'active'\)/)
  assert.match(lib, /\.lte\('next_send_at', new Date\(\)\.toISOString\(\)\)/)
  assert.match(lib, /notify\('deal_notification', recipient\.email,/)
  assert.match(lib, /dealStage: 'nurture'/)
  assert.match(lib, /businessName: `\$\{sequence\.name\} step \$\{nextStep\}`/)
  assert.match(lib, /DAYS_BETWEEN_STEPS/)
  assert.match(lib, /24 \* 60 \* 60 \* 1000/)
  assert.match(lib, /status: 'completed'/)
})

test('nurture: API lists sequences/recipients and supports seed + enroll actions', () => {
  assert.match(route, /export async function GET\(req: NextRequest\)/)
  assert.match(route, /export async function POST\(req: NextRequest\)/)
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /authenticateProfileRequest\(req\)/)
  assert.match(route, /canManageAgency\(auth, agencyId\)/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /nurture_sequences/)
  assert.match(route, /nurture_recipients/)
})

test('nurture: API dispatches on action seed vs enroll', () => {
  assert.match(route, /body\.action === 'seed'/)
  assert.match(route, /seedDefaultSequences\(agencyId\)/)
  assert.match(route, /body\.action === 'enroll'/)
  assert.match(route, /sequenceId and email are required/)
  assert.match(route, /enroll\(sequenceId, email, leadType\)/)
  assert.match(route, /action must be 'seed' or 'enroll'/)
})

test('nurture: dashboard page renders seed button, enroll form, and lists', () => {
  assert.match(page, /'use client'/)
  assert.match(page, /useToast\(\)/)
  assert.match(page, /getAgencyContext\(\)/)
  assert.match(page, /Enroll a contact/)
  assert.match(page, /Seed default sequences/)
  assert.match(page, /Sequences/)
  assert.match(page, /Enrolled contacts/)
  assert.match(page, /\/api\/nurture/)
  assert.match(page, /getStoredAccessToken/)
  assert.match(page, /action: 'seed'/)
  assert.match(page, /action: 'enroll'/)
})
