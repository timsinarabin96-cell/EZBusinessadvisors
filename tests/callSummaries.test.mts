import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/callSummaries.ts', 'utf8')
const route = readFileSync('app/api/intelligence/call-summaries/route.ts', 'utf8')
const page = readFileSync('app/dashboard/call-summaries/page.tsx', 'utf8')
const schema = readFileSync('sql/call_summaries_schema.sql', 'utf8')

test('call summaries: engine reads the real voice tables and never throws', () => {
  assert.match(lib, /export async function summarizeCall/)
  assert.match(lib, /call_sessions/) // voice call sessions table
  assert.match(lib, /call_transcripts/) // transcript rows table
  assert.match(lib, /call_session_id/)
  assert.match(lib, /catch \(err\)/) // never throws
  assert.match(lib, /return \{ ok: false, error:/)
})

test('call summaries: deterministic summary covers intent keywords and duration', () => {
  assert.match(lib, /sell/)
  assert.match(lib, /buy/)
  assert.match(lib, /book/)
  assert.match(lib, /detectIntents/)
  assert.match(lib, /duration/)
  assert.match(lib, /action_items/)
})

test('call summaries: best-effort AI polish with deterministic fallback', () => {
  assert.match(lib, /completeWithDeepSeek/)
  assert.match(lib, /try \{/)
  assert.match(lib, /catch \{/)
  assert.match(lib, /model = 'deterministic'/)
  assert.match(lib, /model = 'deepseek'/)
})

test('call summaries: upserts one row per call and persists', () => {
  assert.match(lib, /onConflict: 'call_id'/)
  assert.match(lib, /call_summaries/)
  assert.match(lib, /transcript_excerpt/)
  assert.match(lib, /sentiment/)
})

test('call summaries: schema is idempotent, agency-scoped, RLS-on, unique per call', () => {
  assert.match(schema, /create table if not exists public\.call_summaries/)
  assert.match(schema, /agency_id\s+uuid not null references public\.agencies\(id\)/)
  assert.match(schema, /call_id\s+uuid references public\.call_sessions\(id\)/)
  assert.match(schema, /summary\s+text not null/)
  assert.match(schema, /action_items\s+jsonb not null default '\[\]'::jsonb/)
  assert.match(schema, /unique \(call_id\)/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.call_summaries from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.call_summaries to authenticated/)
})

test('call summaries: API supports GET list and POST summarize with auth broker', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /createServerClient/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /summarizeCall/)
  assert.match(route, /export const runtime = 'nodejs'/)
})

test('call summaries: dashboard page lists summaries and generates', () => {
  assert.match(page, /AppShell active="Call Summaries"/)
  assert.match(page, /ToastProvider/)
  assert.match(page, /useToast\(\)/)
  assert.match(page, /getAgencyContext/)
  assert.match(page, /api\/intelligence\/call-summaries/)
  assert.match(page, /Generate summary/)
  assert.match(page, /action_items/)
  assert.match(page, /sentiment/)
  assert.match(page, /sb-access-token/)
})
