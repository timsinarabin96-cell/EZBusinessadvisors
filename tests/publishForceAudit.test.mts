/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Force-publish override audit (boss 08-31): force is an audited exception,
// never a silent bypass. Requires a broker-supplied reason; every use records
// who/when/reason/bypassed gates tied to the listing; the compliance owner +
// agency owner are notified automatically. The studio publishes normally
// first — force is only offered when a gate blocks.
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const publish = readFileSync('lib/publish.ts', 'utf8')
const route = readFileSync('app/api/listings/publish/route.ts', 'utf8')
const studio = readFileSync('components/studio/OneShotDealBuilder.tsx', 'utf8')
const sql = readFileSync('sql/publish_force_audit_2026_08_31.sql', 'utf8')

test('force: reason is REQUIRED — publishListing blocks force without forceReason', () => {
  assert.match(publish, /const forceReason = String\(opts\?\.forceReason \|\| ''\)\.trim\(\)/)
  assert.match(publish, /if \(force && !forceReason\)/)
  assert.match(publish, /Force-publish requires a reason — the override is recorded in the compliance audit trail/)
  assert.match(publish, /bypassedGates: string\[\] = \[\]/)
})

test('force: each bypassed gate is recorded (readiness, legitimacy, seller approval, legal)', () => {
  assert.match(publish, /if \(force && readiness\.score < PUBLISH_READINESS_MIN\) bypassedGates\.push\('readiness'\)/)
  assert.match(publish, /if \(force && legitimacy && legitimacy\.verdict !== 'auto_approved'\) bypassedGates\.push\('legitimacy'\)/)
  assert.match(publish, /if \(force && !approval\.approved\) bypassedGates\.push\('seller_approval'\)/)
  assert.match(publish, /if \(legalGate\.missing\.length > 0\) bypassedGates\.push\(`legal_doc:/)
})

test('force: audit row written + listing stamped + notifications fired', () => {
  assert.match(publish, /publish_force_audit'\)\.insert/)
  assert.match(publish, /bypassed_gates: bypassedGates/)
  assert.match(publish, /force_published_at: nowIso/)
  assert.match(publish, /force_published_by: actorProfileId \|\| null/)
  assert.match(publish, /force_publish_reason: forceReason/)
  assert.match(publish, /createNotification\(\{/)
  assert.match(publish, /Listing force-published \(override audited\)/)
  assert.match(publish, /sendEmail\(\{/)
  assert.match(publish, /Compliance: force-publish override/)
  assert.match(publish, /publish_force_audit \(listing/)
})

test('force: route requires forceReason when force=true (422)', () => {
  assert.match(route, /const force = body\.force === true/)
  assert.match(route, /const forceReason = String\(body\.forceReason \|\| ''\)\.trim\(\)/)
  assert.match(route, /if \(force && !forceReason\)/)
  assert.match(route, /status: 422/)
  assert.match(route, /force, forceReason: forceReason \|\| undefined, actorEmail: auth\.user\.email/)
})

test('force: studio publishes NORMALLY first — force only on blocked gate with reason', () => {
  // No unconditional force in goLive.
  assert.match(studio, /body: JSON\.stringify\(\{ listingId \}\)/)
  assert.ok(!/body: JSON\.stringify\(\{ listingId, force: true \}\)/.test(studio))
  // Override panel: reason required, audited override button present.
  assert.match(studio, /const forcePublish = async/)
  assert.match(studio, /force: true, forceReason: forceReason\.trim\(\)/)
  assert.match(studio, /A reason is required for the audited override/)
  assert.match(studio, /Override & Publish \(audited\)/)
  assert.match(studio, /compliance audit trail — who, when, why/)
})

test('force: SQL migration adds audit table + listing stamps', () => {
  assert.match(sql, /create table if not exists public\.publish_force_audit/)
  assert.match(sql, /listing_id\s+uuid not null references public\.listings\(id\)/)
  assert.match(sql, /actor_email\s+text/)
  assert.match(sql, /reason\s+text not null/)
  assert.match(sql, /bypassed_gates jsonb not null default '\[\]'::jsonb/)
  assert.match(sql, /add column if not exists force_published_at timestamptz/)
  assert.match(sql, /add column if not exists force_published_by uuid/)
  assert.match(sql, /add column if not exists force_publish_reason text/)
})
