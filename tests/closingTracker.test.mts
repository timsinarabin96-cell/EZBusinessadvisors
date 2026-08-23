import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/closing_tracker_schema.sql', 'utf8')
const lib = readFileSync('lib/closingTracker.ts', 'utf8')
const route = readFileSync('app/api/closing/route.ts', 'utf8')
const page = readFileSync('app/dashboard/closing/page.tsx', 'utf8')

test('closing: schema is idempotent, agency-scoped, RLS-on, anon revoked', () => {
  assert.match(schema, /create table if not exists public\.deal_closing_milestones/)
  assert.match(schema, /create table if not exists public\.deal_escrow_accounts/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.deal_closing_milestones from anon/)
  assert.match(schema, /revoke all on public\.deal_escrow_accounts from anon/)
})

test('closing: lib has standard checklist + seed, add, update, delete', () => {
  assert.match(lib, /DEFAULT_MILESTONES/)
  assert.match(lib, /LOI signed/)
  assert.match(lib, /Escrow funded/)
  assert.match(lib, /export async function addMilestone/)
  assert.match(lib, /export async function seedMilestones/)
  assert.match(lib, /export async function updateMilestone/)
  assert.match(lib, /export async function deleteMilestone/)
  assert.match(lib, /completed_at = new Date\(\)\.toISOString\(\)/)
})

test('closing: escrow upsert handles fund/release/refund statuses', () => {
  assert.match(lib, /export async function upsertEscrow/)
  assert.match(lib, /status === 'funded'/)
  assert.match(lib, /status === 'released' \|\| input\.status === 'refunded'/)
  assert.match(lib, /funded_at = new Date\(\)\.toISOString\(\)/)
})

test('closing: progress computation counts complete/overdue/nextDue', () => {
  assert.match(lib, /export async function fetchClosingTracker/)
  assert.match(lib, /percent: total \? Math\.round\(\(completed \/ total\) \* 100\) : 0/)
  assert.match(lib, /overdue\+\+/)
  assert.match(lib, /nextDue/)
  assert.match(lib, /categoryBreakdown/)
})

test('closing: API supports GET/POST/PATCH/DELETE with agency gating', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function PATCH/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /action: 'seed' | 'milestone' | 'escrow'/)
  assert.match(route, /listTrackedListings/)
})

test('closing: dashboard page has progress bar, milestone checklist, escrow UI', () => {
  assert.match(page, /Closing & Escrow Tracker/)
  assert.match(page, /Closing progress/)
  assert.match(page, /Milestones/)
  assert.match(page, /Escrow accounts/)
  assert.match(page, /Mark funded/)
  assert.match(page, /\/api\/closing/)
  assert.match(page, /action: 'seed'/)
})
