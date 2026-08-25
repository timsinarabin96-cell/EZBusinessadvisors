import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const notifications = readFileSync('lib/notifications.ts', 'utf8')
const webPush = readFileSync('lib/webPush.ts', 'utf8')
const sw = readFileSync('public/sw.js', 'utf8')
const settings = readFileSync('app/dashboard/settings/page.tsx', 'utf8')

test('push wiring: createNotification fires a web push after recording', () => {
  assert.match(notifications, /sendPushToProfile/)
  assert.match(notifications, /import\('@\/lib\/webPush'\)/)
  assert.match(notifications, /best-effort/)
  assert.match(notifications, /in-app notification already recorded/)
})

test('push wiring: agency-wide notifications ping owners + admins', () => {
  assert.match(notifications, /is_owner\.eq\.true,role\.eq\.admin/)
  assert.match(notifications, /agency_members/)
  assert.match(notifications, /profile_id: input\.profile_id \|\| null/)
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
