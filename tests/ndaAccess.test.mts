import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/nda_access_schema.sql', 'utf8')
const lib = readFileSync('lib/ndaAccess.ts', 'utf8')
const route = readFileSync('app/api/data-rooms/access-request/route.ts', 'utf8')
const reviewRoute = readFileSync('app/api/data-rooms/access-request/review/route.ts', 'utf8')
const page = readFileSync('app/dashboard/nda-requests/page.tsx', 'utf8')
const email = readFileSync('lib/email.ts', 'utf8')

test('nda: schema is idempotent, agency-scoped, RLS-on, anon revoked', () => {
  assert.match(schema, /create table if not exists public\.data_room_access_requests/)
  assert.match(schema, /nda_signature text not null/)
  assert.match(schema, /nda_signed_at timestamptz not null default now\(\)/)
  assert.match(schema, /status text not null default 'pending'/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.data_room_access_requests from anon/)
})

test('nda: lib validates input, creates request, and alerts brokers', () => {
  assert.match(lib, /export async function requestNdaAccess/)
  assert.match(lib, /requester_email.*includes\('@'\)/)
  assert.match(lib, /from\('data_room_access_requests'\)/)
  assert.match(lib, /\.insert\(\{/)
  assert.match(lib, /notify\('nda_request_received'/)
  assert.match(lib, /reviewNdaRequest/)
  assert.match(lib, /data_room_buyers/)
  assert.match(lib, /notify\(\s*action === 'approve' \? 'nda_access_granted' : 'nda_access_rejected'/)
})

test('nda: public POST route + broker GET route exist', () => {
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function GET/)
  assert.match(route, /requestNdaAccess/)
  assert.match(route, /x-forwarded-for/)
  assert.match(route, /listNdaRequests/)
})

test('nda: review route is broker-gated', () => {
  assert.match(reviewRoute, /canManageAgency/)
  assert.match(reviewRoute, /forbiddenResponse\(\)/)
  assert.match(reviewRoute, /action: 'approve' \| 'reject'/)
  assert.match(reviewRoute, /reviewNdaRequest/)
})

test('nda: dashboard page shows request queue with approve/reject', () => {
  assert.match(page, /NDA Access Requests/)
  assert.match(page, /Approve & grant access/)
  assert.match(page, /Reject/)
  assert.match(page, /\/api\/data-rooms\/access-request\/review/)
  assert.match(page, /nda_signature/)
})

test('nda: email templates for received/granted/rejected exist', () => {
  assert.match(email, /'nda_request_received'/)
  assert.match(email, /'nda_access_granted'/)
  assert.match(email, /'nda_access_rejected'/)
  assert.match(email, /ndaRequestReceived\(/)
  assert.match(email, /ndaAccessGranted\(/)
  assert.match(email, /ndaAccessRejected\(/)
})
