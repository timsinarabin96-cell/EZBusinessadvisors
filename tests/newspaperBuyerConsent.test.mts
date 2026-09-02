/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Weekly Newspaper — manual buyer-add newsletter CONSENT regression tests.
// Boss requirement: when a broker manually adds a buyer, subscribing them to
// the weekly digest must be an explicit, default-UNCHECKED opt-in. No opt-in
// -> never subscribed, never sent. Must hold per-agency (multi-tenant).
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const leadFormModal = readFileSync('components/leads/LeadFormModal.tsx', 'utf8')
const leadsDashboard = readFileSync('components/leads/LeadsDashboard.tsx', 'utf8')
const subscribeLeadRoute = readFileSync('app/api/newsletter/subscribe-lead/route.ts', 'utf8')
const buyerProfilePopup = readFileSync('components/leads/BuyerProfilePopup.tsx', 'utf8')
const csvTools = readFileSync('lib/csvTools.ts', 'utf8')
const leads2 = readFileSync('lib/leads2.ts', 'utf8')
const migrationV4 = readFileSync('sql/weekly_newspaper_v4_buyer_consent_2026_09_02.sql', 'utf8')
const cronRoute = readFileSync('app/api/cron/weekly-newspaper/route.ts', 'utf8')
const publishRoute = readFileSync('app/api/newspaper/publish/route.ts', 'utf8')

// -- 1 & 2. Manual "Add Buyer" surface has an explicit, default-unchecked ----
test('LeadFormModal: buyer add/edit form has an explicit weekly-newsletter opt-in checkbox, default unchecked', () => {
  assert.match(leadFormModal, /useState<boolean>\(\(lead as any\)\?\.newsletter_opt_in \|\| false\)/)
  assert.match(leadFormModal, /type="checkbox"/)
  assert.match(leadFormModal, /Subscribe to weekly buyer newsletter \(optional\)/)
  assert.match(leadFormModal, /checked=\{newsletterOptIn\}/)
})

test('LeadFormModal: consent flag is threaded through both create and edit submit paths', () => {
  assert.match(leadFormModal, /newsletter_opt_in: newsletterOptIn/g)
  // appears at least twice: buyer-create path and buyer-update path
  const matches = leadFormModal.match(/newsletter_opt_in: newsletterOptIn/g) || []
  assert.ok(matches.length >= 2, `expected consent flag wired into >=2 submit paths, got ${matches.length}`)
})

// -- 3 & 4. Consent persisted + sending gated on it, never auto-subscribed ---
test('LeadsDashboard: consent is only synced via the explicit subscribe-lead call, never auto on plain create', () => {
  assert.match(leadsDashboard, /syncNewsletterConsent/)
  assert.match(leadsDashboard, /\/api\/newsletter\/subscribe-lead/)
  // Consent is only synced when the checkbox value is defined (not silently
  // defaulted to true anywhere in this file).
  assert.doesNotMatch(leadsDashboard, /optIn:\s*true/)
})

test('subscribe-lead route: only creates/activates a subscription when optIn is true; false unsubscribes', () => {
  assert.match(subscribeLeadRoute, /const optIn = !!body\.optIn/)
  assert.match(subscribeLeadRoute, /if \(!optIn\) \{/)
  assert.match(subscribeLeadRoute, /status: 'unsubscribed'/)
  assert.match(subscribeLeadRoute, /status: 'active'/)
  assert.match(subscribeLeadRoute, /audience: 'buyer'/)
})

// -- 5. Multi-agency isolation -------------------------------------------------
test('subscribe-lead route: caller must be a member of the buyer lead\'s own agency (no cross-agency consent)', () => {
  assert.match(subscribeLeadRoute, /authenticated\.memberships\.some\(\(m\) => m\.agency_id === lead\.agency_id\)/)
  assert.match(subscribeLeadRoute, /forbiddenResponse\(\)/)
})

test('subscribe-lead route: subscription row is scoped to the lead\'s own agency_id (isolation per tenant)', () => {
  assert.match(subscribeLeadRoute, /agency_id: lead\.agency_id/)
  assert.match(subscribeLeadRoute, /\.eq\('agency_id', lead\.agency_id\)/)
})

test('migration v4: adds buyer_leads.newsletter_opt_in (default false) and agency-scoped unique subscription index', () => {
  assert.match(migrationV4, /add column if not exists newsletter_opt_in boolean not null default false/)
  assert.match(migrationV4, /newspaper_subscriptions_email_audience_agency_idx/)
  assert.match(migrationV4, /agency_id uuid/)
})

// -- 6. Manual publish + weekly cron still gate on active+buyer subscriptions
//      (i.e. no opt-in -> no subscription row -> never included in the send)
test('cron + publish routes only ever send to rows that exist as active buyer subscriptions (opt-in gated)', () => {
  assert.match(cronRoute, /eq\('status', 'active'\)\.eq\('audience', 'buyer'\)/)
  assert.match(publishRoute, /eq\('status', 'active'\)\.eq\('audience', 'buyer'\)/)
})

// -- 6. Opt-in state surfaced in buyer detail UI ------------------------------
test('BuyerProfilePopup: surfaces subscribed / not-subscribed state for buyer leads', () => {
  assert.match(buyerProfilePopup, /newsletter_opt_in/)
  assert.match(buyerProfilePopup, /Subscribed to weekly|Not subscribed/)
})

// -- Bulk CSV import never auto-subscribes (opt-in column defaults false) ----
test('csvTools bulk buyer import never sets newsletter_opt_in or inserts into newspaper_subscriptions', () => {
  assert.doesNotMatch(csvTools, /newsletter_opt_in/)
  assert.doesNotMatch(csvTools, /newspaper_subscriptions/)
})

test('leads2 unified lead type carries newsletter_opt_in read-through for the UI badge', () => {
  assert.match(leads2, /newsletter_opt_in\?: boolean \| null/)
  assert.match(leads2, /newsletter_opt_in: !!r\.newsletter_opt_in/)
})
