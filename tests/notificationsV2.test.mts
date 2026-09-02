import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const {
  EMPTY_DIGEST_ACTIVITY,
  renderHourlyDigest,
  resolveImmediateProfileIds,
  scopeDigestActivity,
  shouldSendHourlyDigest,
} = await import('../lib/notificationV2.ts')

test('notifications v2: hourly digest never crosses agency boundaries', () => {
  const activity = {
    ...EMPTY_DIGEST_ACTIVITY,
    buyerLeads: [
      { id: 'lead-a', agency_id: 'agency-a', full_name: 'Buyer A' },
      { id: 'lead-b', agency_id: 'agency-b', full_name: 'Buyer B' },
    ],
    offers: [
      { id: 'offer-a', listings: { agency_id: 'agency-a', business_name: 'A Co' } },
      { id: 'offer-b', listings: { agency_id: 'agency-b', business_name: 'B Co' } },
    ],
  }
  const scoped = scopeDigestActivity(activity, 'agency-a')
  assert.deepEqual(scoped.buyerLeads.map((row) => row.id), ['lead-a'])
  assert.deepEqual(scoped.offers.map((row) => row.id), ['offer-a'])
  const rendered = renderHourlyDigest({ agencyName: 'Agency A', activity: scoped, windowStart: '2026-09-02T17:00:00Z', windowEnd: '2026-09-02T18:00:00Z' })
  assert.match(rendered.html, /Buyer A/)
  assert.doesNotMatch(rendered.html, /Buyer B|B Co/)
})

test('notifications v2: immediate targeting always includes listing assignee', () => {
  const ids = resolveImmediateProfileIds('assigned-agent', [
    { profile_id: 'agency-owner', role: 'admin', is_owner: true },
    { profile_id: 'other-agent', role: 'broker', is_owner: false },
  ], true)
  assert.deepEqual(ids.sort(), ['agency-owner', 'assigned-agent'])
  const radar = readFileSync('lib/dealRadar.ts', 'utf8')
  const matching = readFileSync('lib/buyerMatching.ts', 'utf8')
  assert.match(radar, /Every new match is an immediate assignee event/)
  assert.match(radar, /buyer-match:/)
  assert.match(matching, /ignoreDuplicates: true/)
})

test('notifications v2: digest respects agency and profile opt-out', () => {
  assert.equal(shouldSendHourlyDigest(true, true), true)
  assert.equal(shouldSendHourlyDigest(false, true), false)
  assert.equal(shouldSendHourlyDigest(true, false), false)
  assert.equal(shouldSendHourlyDigest(undefined, undefined), true)
})

test('notifications v2: high alerts use required subject and critical hooks', () => {
  const healthRoute = readFileSync('app/api/cron/health-check/route.ts', 'utf8')
  const stripeRoute = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
  const securityRoute = readFileSync('app/api/auth/security-alert/route.ts', 'utf8')
  assert.match(readFileSync('lib/highAlerts.ts', 'utf8'), /🚨 HIGH ALERT —/)
  assert.match(healthRoute, /sendHighAlert/)
  assert.match(stripeRoute, /Stripe payment failed/)
  assert.match(securityRoute, /Suspicious sign-in detected/)
})

test('notifications v2: migration is additive and defaults both preferences on', () => {
  const migration = readFileSync('sql/notifications_v2_2026_09_02.sql', 'utf8')
  assert.match(migration, /add column if not exists notifications_hourly_digest boolean not null default true/)
  assert.match(migration, /add column if not exists email_digest_hourly boolean not null default true/)
})
