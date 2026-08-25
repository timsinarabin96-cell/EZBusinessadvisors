import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const notifications = readFileSync('lib/notifications.ts', 'utf8')
const notificationsServer = readFileSync('lib/notificationsServer.ts', 'utf8')
const webPush = readFileSync('lib/webPush.ts', 'utf8')
const sw = readFileSync('public/sw.js', 'utf8')
const settings = readFileSync('app/dashboard/settings/page.tsx', 'utf8')

test('push wiring: push lives in the SERVER-ONLY module, not client-reachable lib', () => {
  // The client-safe notifications lib must NOT import web-push (Node tls would
  // leak into the browser bundle and break the production build).
  assert.ok(!notifications.includes('webPush'), 'notifications.ts must not import webPush')
  assert.ok(!notifications.includes('sendPushToProfile'), 'notifications.ts must not import webPush helpers')
  // The server-only module owns the push firing.
  assert.match(notificationsServer, /createNotificationWithPush/)
  assert.match(notificationsServer, /sendPushToProfile/)
  assert.match(notificationsServer, /import\('@\/lib\/webPush'\)/)
  assert.match(notificationsServer, /best-effort/)
})

test('push wiring: agency-wide pushes target owners + admins', () => {
  assert.match(notificationsServer, /is_owner\.eq\.true,role\.eq\.admin/)
  assert.match(notificationsServer, /agency_members/)
})

test('push wiring: web-push lib stores subs and sends via VAPID', () => {
  assert.match(webPush, /savePushSubscription/)
  assert.match(webPush, /removePushSubscription/)
  assert.match(webPush, /sendPushToProfile/)
  assert.match(webPush, /webpush\.setVapidDetails/)
  assert.match(webPush, /404 \|\| err\?\.statusCode === 410/)
})

test('push wiring: service worker handles push events', () => {
  assert.match(sw, /addEventListener\('push'/)
  assert.match(sw, /concord-push/)
})

test('push wiring: settings page mounts the push setup', () => {
  assert.match(settings, /PushNotifications/)
})
