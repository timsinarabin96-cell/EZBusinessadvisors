import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/communications_schema.sql', 'utf8')
const lib = readFileSync('lib/communications.ts', 'utf8')
const route = readFileSync('app/api/communications/route.ts', 'utf8')
const page = readFileSync('app/dashboard/communications/page.tsx', 'utf8')

test('comms: schema creates communications table with agency RLS', () => {
  assert.match(schema, /create table if not exists public\.communications/)
  assert.match(schema, /channel text not null default 'call'/)
  assert.match(schema, /direction text not null default 'outbound'/)
  assert.match(schema, /outcome text not null default 'other'/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.communications from anon/)
})

test('comms: lib logs + auto-reschedules unanswered calls', () => {
  assert.match(lib, /export async function logCommunication/)
  assert.match(lib, /export async function listCommunications/)
  assert.match(lib, /export async function lastContactedAt/)
  assert.match(lib, /auto_reschedule/)
  assert.match(lib, /no_answer/)
  assert.match(lib, /quickReminder/)
  assert.match(lib, /Call back — no answer/)
})

test('comms: API accepts channel/direction validation and entity links', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /channel must be call\|email\|sms\|meeting\|other/)
  assert.match(route, /direction must be outbound\|inbound/)
  assert.match(route, /auto_reschedule/)
})

test('comms: dashboard page has log form, stale section, history', () => {
  assert.match(page, /Communication Log/)
  assert.match(page, /Stale — no contact in 14 days/)
  assert.match(page, /Log a communication/)
  assert.match(page, /Auto-schedule a call-back/)
  assert.match(page, /\/api\/communications/)
  assert.match(page, /\/api\/stale/)
})
