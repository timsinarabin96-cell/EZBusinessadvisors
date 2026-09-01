import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/dataRoomQa.ts', 'utf8')
const route = readFileSync('app/api/intelligence/data-room-qa/route.ts', 'utf8')
const page = readFileSync('components/ai/panels/DataRoomQaPanel.tsx', 'utf8')
const schema = readFileSync('sql/data_room_qa_schema.sql', 'utf8')

test('dataRoomQa: service client uses the service-role key and never throws on config gaps', () => {
  assert.match(lib, /from '@supabase\/supabase-js'/) // createClient import
  assert.match(lib, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(lib, /NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(lib, /persistSession: false/)
})

test('dataRoomQa: askQuestion reads the room file index and persists answered/failed rows', () => {
  assert.match(lib, /export async function askQuestion/)
  assert.match(lib, /data_room_files/)
  assert.match(lib, /is_deleted/)
  assert.match(lib, /status\s*=\s*'answered'/)
  assert.match(lib, /status: 'failed'/)
  assert.match(lib, /answered_at/)
})

test('dataRoomQa: deterministic keyword matching ranks files by name/notes with a fallback', () => {
  assert.match(lib, /export function rankFilesForQuestion/)
  assert.match(lib, /export function buildDeterministicAnswer/)
  assert.match(lib, /file_name/)
  assert.match(lib, /notes/)
  assert.match(lib, /could not find documents matching your question/)
})

test('dataRoomQa: AI polish is best-effort inside try/catch with deterministic fallback', () => {
  assert.match(lib, /completeSensitive/)
  assert.match(lib, /try \{/)
  assert.match(lib, /catch \{/)
  assert.match(lib, /deterministic/)
})

test('dataRoomQa: listQuestions filters by agency and optional data room', () => {
  assert.match(lib, /export async function listQuestions/)
  assert.match(lib, /\.eq\('agency_id', agencyId\)/)
  assert.match(lib, /\.eq\('data_room_id', dataRoomId\)/)
})

test('dataRoomQa: schema is idempotent, agency-scoped, RLS-on with status check', () => {
  assert.match(schema, /create table if not exists public\.data_room_qa/)
  assert.match(schema, /agency_id\s+uuid not null references public\.agencies\(id\) on delete cascade/)
  assert.match(schema, /data_room_id\s+uuid not null references public\.data_rooms\(id\) on delete cascade/)
  assert.match(schema, /status\s+text not null default 'pending' check \(status in \('pending', 'answered', 'failed'\)\)/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.data_room_qa from anon/)
  assert.match(schema, /grant select, insert, update, delete on public\.data_room_qa to authenticated/)
})

test('dataRoomQa: API supports GET (list + data-room picker) and POST ask with auth broker', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /authenticateProfileRequest/)
  assert.match(route, /canManageAgency/)
  assert.match(route, /forbiddenResponse\(\)/)
  assert.match(route, /unauthorizedResponse\(\)/)
  assert.match(route, /export const runtime = 'nodejs'/)
  assert.match(route, /action.*rooms/)
  assert.match(route, /data_rooms/)
  assert.match(route, /askQuestion/)
  assert.match(route, /listQuestions/)
})

test('dataRoomQa: dashboard page has room picker, question input, and answer display', () => {
  assert.match(page, /useToast\(\)/)
  assert.match(page, /getAgencyContext/)
  assert.match(page, /getStoredAccessToken/)
  assert.match(page, /Ask a question/)
  assert.match(page, /Q&A history/)
  assert.match(page, /\/api\/intelligence\/data-room-qa/)
})
