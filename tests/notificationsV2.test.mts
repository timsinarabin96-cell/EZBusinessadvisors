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

test('notifications v2 premium: platform vs agency identity split (subjects + branding)', () => {
  const activity = { ...EMPTY_DIGEST_ACTIVITY, buyerLeads: [{ id: 'l1', agency_id: 'a', full_name: 'Ada Buyer', phone: '(717) 555-0100' }] }
  const agency = renderHourlyDigest({ agencyName: 'EZ Business Advisors', activity, windowStart: '2026-09-02T17:00:00Z', windowEnd: '2026-09-02T18:00:00Z', brand: { name: 'EZ Business Advisors', accentColor: '#c9a84c' } })
  const platform = renderHourlyDigest({ agencyName: 'Concord Deal Platform', activity, windowStart: '2026-09-02T17:00:00Z', windowEnd: '2026-09-02T18:00:00Z', platformRollup: true, brand: { name: 'Concord Deal Platform' }, agencySummaries: [{ name: 'EZ Business Advisors', listings: 2, leads: 1, ndas: 0, intakes: 0, revenue: 0, commissions: 0 }] })
  assert.match(agency.subject, /EZ Business Advisors — Deal Desk Digest/)
  assert.match(platform.subject, /Platform Admin Update/)
  assert.doesNotMatch(agency.subject, /Platform Admin Update/)
  // Branding headers + charts present
  assert.match(agency.html, /Deal Desk Digest/)
  assert.match(agency.html, /Deal-desk mix/)
  assert.match(agency.html, /Buyer leads/)
  assert.match(platform.html, /Activity by agency/)
  assert.match(platform.html, /EZ Business Advisors/)
  // Monogram tile (no broken images): brand without logo must NOT emit <img>
  assert.doesNotMatch(agency.html, /<img/)
  // tel link rendered for buyer phone
  assert.match(agency.html, /tel:/)
})

test('notifications v2 premium: quiet window still renders premium state, never throws', () => {
  const rendered = renderHourlyDigest({ agencyName: 'EZ Business Advisors', activity: EMPTY_DIGEST_ACTIVITY, windowStart: '2026-09-02T17:00:00Z', windowEnd: '2026-09-02T18:00:00Z' })
  assert.match(rendered.html, /quiet window/i)
  assert.match(rendered.html, /Executive Brief/)
  assert.ok(rendered.html.length > 800)
})

test('notifications v2 premium: logo URL renders as image only when absolute https', () => {
  const activity = { ...EMPTY_DIGEST_ACTIVITY, calls: [{ id: 'c1', agency_id: 'a', title: 'Buyer call' }] }
  const withLogo = renderHourlyDigest({ agencyName: 'EZ Business Advisors', activity, windowStart: '2026-09-02T17:00:00Z', windowEnd: '2026-09-02T18:00:00Z', brand: { name: 'EZ Business Advisors', logoUrl: 'https://cdn.ezbusinessadvisors.com/logo.png' } })
  const withRelative = renderHourlyDigest({ agencyName: 'EZ Business Advisors', activity, windowStart: '2026-09-02T17:00:00Z', windowEnd: '2026-09-02T18:00:00Z', brand: { name: 'EZ Business Advisors', logoUrl: '/api/agency/logo.png' } })
  assert.match(withLogo.html, /<img/)
  assert.doesNotMatch(withRelative.html, /<img/)
})

test('notifications v2 premium: agent activity block renders agent name + action', () => {
  const activity = { ...EMPTY_DIGEST_ACTIVITY, agentActivity: [{ id: 'aa1', agency_id: 'a', action: 'called buyer', agent_name: 'Daniel Harbor', summary: 'Follow-up call on Harbor listing' }] }
  const rendered = renderHourlyDigest({ agencyName: 'Harbor Acquisitions', activity, windowStart: '2026-09-02T17:00:00Z', windowEnd: '2026-09-02T18:00:00Z' })
  assert.match(rendered.html, /Daniel Harbor/)
  assert.match(rendered.html, /called buyer/)
  assert.match(rendered.html, /Follow-up call on Harbor listing/)
})

test('notifications v2 premium: per-agency summary rows all render in platform chart', () => {
  const activity = { ...EMPTY_DIGEST_ACTIVITY }
  const summaries = [
    { name: 'EZ Business Advisors', listings: 3, leads: 4, ndas: 1, intakes: 1, revenue: 500, commissions: 100 },
    { name: 'Harbor Acquisitions', listings: 1, leads: 2, ndas: 0, intakes: 0, revenue: 0, commissions: 0 },
  ]
  const rendered = renderHourlyDigest({ agencyName: 'Concord Deal Platform', activity, windowStart: '2026-09-02T17:00:00Z', windowEnd: '2026-09-02T18:00:00Z', platformRollup: true, brand: { name: 'Concord Deal Platform' }, agencySummaries: summaries })
  assert.match(rendered.html, /EZ Business Advisors/)
  assert.match(rendered.html, /Harbor Acquisitions/)
  assert.match(rendered.html, /Activity by agency/)
})
