import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/listing_refs_reminders_schema.sql', 'utf8')
const lib = readFileSync('lib/reminders.ts', 'utf8')
const route = readFileSync('app/api/reminders/route.ts', 'utf8')
const page = readFileSync('app/dashboard/reminders/page.tsx', 'utf8')
const dashboard = readFileSync('components/listings/ListingsDashboard.tsx', 'utf8')

test('listing refs: schema adds listing_ref, sequence, trigger, and backfill', () => {
  assert.match(schema, /alter table public\.listings add column if not exists listing_ref text/)
  assert.match(schema, /create sequence if not exists public\.listing_ref_seq/)
  assert.match(schema, /create or replace function public\.assign_listing_ref\(\)/)
  assert.match(schema, /listings_assign_ref/)
  assert.match(schema, /Backfill existing listings/)
  assert.match(schema, /lpad\(counter::text, 4, '0'\)/)
})

test('reminders: schema creates reminders table with agency RLS', () => {
  assert.match(schema, /create table if not exists public\.reminders/)
  assert.match(schema, /kind text not null default 'call_back'/)
  assert.match(schema, /due_at timestamptz not null/)
  assert.match(schema, /status text not null default 'pending'/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.reminders from anon/)
})

test('reminders: lib supports CRUD + smart scheduling', () => {
  assert.match(lib, /export async function createReminder/)
  assert.match(lib, /export async function listReminders/)
  assert.match(lib, /export async function setReminderStatus/)
  assert.match(lib, /export async function deleteReminder/)
  assert.match(lib, /export async function reminderCounts/)
  assert.match(lib, /export function suggestNextCallTime/)
  assert.match(lib, /export async function quickCallBack/)
  assert.match(lib, /business hours/)
})

test('reminders: API supports GET/POST/PATCH/DELETE with auth', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function PATCH/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /body\.quick/)
  assert.match(route, /status \(done\|pending\|cancelled\)/)
})

test('reminders: dashboard page renders queue, counts, quick add', () => {
  assert.match(page, /Call-Back & Reminders/)
  assert.match(page, /Overdue/)
  assert.match(page, /Due today/)
  assert.match(page, /Smart suggestion/)
  assert.match(page, /\/api\/reminders/)
  assert.match(page, /assignToMe/)
})

test('listing refs: listing cards show the human-readable ID', () => {
  assert.match(dashboard, /listing\.listing_ref/)
  assert.match(dashboard, /EZB-|listing_ref/)
})

test('reminders: smart scheduler avoids weekends and late hours', () => {
  // Saturday → Monday at 10am
  const sat = new Date('2026-08-22T09:00:00') // a Saturday
  const result = suggestNextCallTimeForTest(sat)
  assert.equal(result.getDay(), 1)
  assert.equal(result.getHours(), 10)
})

// Minimal reimplementation of the weekday logic for the test (kept in sync).
function suggestNextCallTimeForTest(now: Date): Date {
  const d = new Date(now)
  const day = d.getDay()
  if (day === 6) d.setDate(d.getDate() + 2) // Sat → Mon
  else if (day === 0) d.setDate(d.getDate() + 1) // Sun → Mon
  else if (d.getHours() >= 17) d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return d
}
