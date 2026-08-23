import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/negotiation.ts', 'utf8')
const route = readFileSync('app/api/intelligence/negotiation/route.ts', 'utf8')
const page = readFileSync('app/dashboard/negotiation/page.tsx', 'utf8')
const schema = readFileSync('sql/negotiation_schema.sql', 'utf8')
const offersLib = readFileSync('lib/offers.ts', 'utf8')

test('negotiation: service client uses the service-role key', () => {
  assert.match(lib, /from '@supabase\/supabase-js'/) // createClient import
  assert.match(lib, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(lib, /persistSession: false/)
})

test('negotiation: draftCounterOffer reads the offer, listing, and buyer lead', () => {
  assert.match(lib, /export async function draftCounterOffer/)
  assert.match(lib, /deal_offers/)
  assert.match(lib, /listings\(business_name, asking_price, agency_id\)/)
  assert.match(lib, /buyer_leads\(full_name, company\)/)
  assert.match(lib, /Offer not found/)
})

test('negotiation: scoreOffer-style logic proposes three counter variants with rationales', () => {
  assert.match(lib, /scoreOffer/)
  assert.match(lib, /export function buildCounterVariants/)
  const count = (lib.match(/label: '/g) || []).length
  assert.ok(count >= 3, `expected at least 3 variant labels, got ${count}`)
  assert.match(lib, /Moderate bump/)
  assert.match(lib, /Cash-heavy close/)
  assert.match(lib, /Full value, extended diligence/)
  assert.match(lib, /rationale:/)
  assert.match(lib, /cash_at_closing/)
  assert.match(lib, /seller_note/)
  assert.match(lib, /diligence_days/)
})

test('negotiation: content jsonb has variants + instructions and renders letter-style HTML', () => {
  assert.match(lib, /variants: CounterVariant\[\]/)
  assert.match(lib, /instructions/)
  assert.match(lib, /export function renderNegotiationHtml/)
  assert.match(lib, /<!DOCTYPE html>/)
  assert.match(lib, /Negotiation Strategy/)
  assert.match(lib, /Counter-Offer Options/)
})

test('negotiation: drafts upsert per offer with a plain-insert fallback and never throw', () => {
  assert.match(lib, /onConflict: 'offer_id'/)
  assert.match(lib, /\.insert\(payload\)/)
  assert.match(lib, /try \{/)
  assert.match(lib, /catch \(err\)/)
  assert.match(lib, /export async function listNegotiationDrafts/)
})

test('negotiation: schema is idempotent, agency-scoped, RLS-on with draft_type check', () => {
  assert.match(schema, /create table if not exists public\.negotiation_drafts/)
  assert.match(schema, /offer_id\s+uuid not null references public\.deal_offers\(id\) on delete cascade/)
  assert.match(schema, /draft_type text not null default 'counter' check \(draft_type in \('counter', 'response', 'playbook'\)\)/)
  assert.match(schema, /content\s+jsonb not null default '\{\}'::jsonb/)
  assert.match(schema, /html\s+text/)
  assert.match(schema, /create unique index if not exists negotiation_drafts_offer_uniq/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.negotiation_drafts from anon/)
})

test('negotiation: API supports GET list and POST generate with auth broker', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /draftCounterOffer/)
  assert.match(route, /listNegotiationDrafts/)
})

test('negotiation: dashboard page picks offers, generates, and prints', () => {
  assert.match(page, /AppShell active="Negotiation Assistant"/)
  assert.match(page, /ToastProvider/)
  assert.match(page, /useToast\(\)/)
  assert.match(page, /getAgencyContext/)
  assert.match(page, /sb-access-token/)
  assert.match(page, /\/api\/offers\?agencyId=/)
  assert.match(page, /\/api\/intelligence\/negotiation/)
  assert.match(page, /window\.print\(\)/)
  assert.match(page, /Generated strategies/)
})

test('negotiation: reuses the Offer Lab seller-value scoring model', () => {
  assert.match(offersLib, /export function scoreOffer/)
})
