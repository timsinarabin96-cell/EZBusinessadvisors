import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/dataRoomIntent.ts', 'utf8')
const logRoute = readFileSync('app/api/data-rooms/view-log/route.ts', 'utf8')
const intentRoute = readFileSync('app/api/data-rooms/intent/route.ts', 'utf8')
const qaPage = readFileSync('components/ai/panels/DataRoomQaPanel.tsx', 'utf8')

// ---------------------------------------------------------------------------
// Structure: lib + routes
// ---------------------------------------------------------------------------

test('dataRoomIntent: lib logs views/downloads into the live view-log tables', () => {
  assert.match(lib, /data_room_view_logs/)
  assert.match(lib, /data_room_download_logs/)
  assert.match(lib, /export async function logRoomFileIntent/)
  assert.match(lib, /DEDUPE_WINDOW_MS/)
  assert.match(lib, /export async function fetchRoomIntent/)
})

test('dataRoomIntent: view-log route is public fire-and-forget (no auth import)', () => {
  assert.match(logRoute, /POST/)
  assert.doesNotMatch(logRoute, /authenticateProfileRequest/)
  assert.match(logRoute, /x-forwarded-for/)
  assert.match(logRoute, /skipped/)
})

test('dataRoomIntent: intent route is broker-gated per room agency', () => {
  assert.match(intentRoute, /authenticateProfileRequest/)
  assert.match(intentRoute, /canManageAgency/)
  assert.match(intentRoute, /fetchRoomIntent/)
  assert.match(intentRoute, /roomId is required/)
})

test('dataRoomIntent: broker panel wired into data-room-qa page', () => {
  assert.match(qaPage, /Buyer intent/)
  assert.match(qaPage, /\/api\/data-rooms\/intent/)
  assert.match(qaPage, /Most-viewed documents/)
  assert.match(qaPage, /Engaged buyers/)
  assert.match(qaPage, /score.*\/100/)
})

// ---------------------------------------------------------------------------
// Pure scoring behavior (imported directly)
// ---------------------------------------------------------------------------

const { computeIntentScore, recencyWeight } = await import('../lib/dataRoomIntent.ts')

test('recencyWeight: fresh views weigh 1.0, 30d+ decay, old views weigh 0.3', () => {
  const now = '2026-08-24T12:00:00Z'
  assert.equal(recencyWeight('2026-08-23T12:00:00Z', now), 1) // 1 day
  assert.equal(recencyWeight('2026-07-01T12:00:00Z', now), 0.3) // ~54 days
  const w30 = recencyWeight('2026-07-25T12:00:00Z', now) // 30 days
  assert.equal(w30, 0.6)
  const w8 = recencyWeight('2026-08-16T12:00:00Z', now) // 8 days
  assert.equal(w8, 0.6)
})

test('computeIntentScore: monotonic in activity, bounded 0-100', () => {
  const now = '2026-08-24T12:00:00Z'
  const one = computeIntentScore([{ viewedAtIso: now, kind: 'pdf' }], [], now)
  const many = computeIntentScore(
    Array.from({ length: 20 }, (_, i) => ({ viewedAtIso: now, kind: i % 3 === 0 ? 'pdf' : 'excel' })),
    [],
    now,
  )
  assert.ok(many > one, 'more views → higher score')
  assert.ok(one >= 0 && one <= 100)
  assert.ok(many <= 100)
})

test('computeIntentScore: downloads count double, category breadth adds', () => {
  const now = '2026-08-24T12:00:00Z'
  const viewsOnly = computeIntentScore([{ viewedAtIso: now, kind: 'pdf' }], [], now)
  const viewsPlusDownload = computeIntentScore([{ viewedAtIso: now, kind: 'pdf' }], [{ downloadedAtIso: now }], now)
  assert.ok(viewsPlusDownload > viewsOnly, 'downloads boost intent')

  const oneKind = computeIntentScore(
    Array.from({ length: 10 }, () => ({ viewedAtIso: now, kind: 'pdf' })),
    [],
    now,
  )
  const fourKinds = computeIntentScore(
    Array.from({ length: 10 }, (_, i) => ({ viewedAtIso: now, kind: ['pdf', 'excel', 'word', 'image'][i % 4] })),
    [],
    now,
  )
  assert.ok(fourKinds > oneKind, 'breadth across categories boosts intent')
})

test('computeIntentScore: stale activity scores lower than fresh', () => {
  const now = '2026-08-24T12:00:00Z'
  const fresh = computeIntentScore([{ viewedAtIso: now, kind: 'pdf' }], [], now)
  const stale = computeIntentScore([{ viewedAtIso: '2026-05-01T12:00:00Z', kind: 'pdf' }], [], now)
  assert.ok(fresh > stale, 'recent engagement weighs more')
})
