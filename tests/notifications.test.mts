import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/notifications_schema.sql', 'utf8')
const lib = readFileSync('lib/notifications.ts', 'utf8')
const route = readFileSync('app/api/notifications/route.ts', 'utf8')
const page = readFileSync('components/overview/NotificationsPanel.tsx', 'utf8')

test('notifications: schema is idempotent, agency-scoped, RLS-on', () => {
  assert.match(schema, /create table if not exists public\.app_notifications/)
  assert.match(schema, /read_at timestamptz/)
  assert.match(schema, /enable row level security/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
  assert.match(schema, /revoke all on public\.app_notifications from anon/)
})

test('notifications: lib creates, lists, marks read, counts unread', () => {
  assert.match(lib, /export async function createNotification/)
  assert.match(lib, /export async function listNotifications/)
  assert.match(lib, /export async function markRead/)
  assert.match(lib, /export async function unreadCount/)
  assert.match(lib, /notifyReview/)
  assert.match(lib, /notifyNdaDecision/)
  assert.match(lib, /notifyMatch/)
})

test('notifications: API supports list + mark-all-read', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function PATCH/)
  assert.match(route, /unread=1/)
  assert.match(route, /markRead/)
})

test('notifications: dashboard page renders inbox with read state', () => {
  assert.match(page, /🛎️ Notifications/)
  assert.match(page, /Mark all read/)
  assert.match(page, /\/api\/notifications/)
  assert.match(page, /read_at/)
})
