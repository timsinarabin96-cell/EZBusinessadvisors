/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Stale-draft nudge (boss 08-31): drafts parked waiting on seller input are
// surfaced through the SAME stale-deal pattern as active listings — no separate
// reminder system. Drafts untouched past a threshold are listed by the scanner
// and nudged via a deduped in-app notification to the owning agent. Also locks
// the /dashboard/listings 404 fix (post-create redirect now points at /listings).
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const staleDeals = readFileSync('lib/staleDeals.ts', 'utf8')
const route = readFileSync('app/api/stale/drafts/route.ts', 'utf8')
const panel = readFileSync('components/listings/ParkedDraftsPanel.tsx', 'utf8')
const dashboard = readFileSync('components/listings/ListingsDashboard.tsx', 'utf8')
const notifications = readFileSync('components/overview/NotificationsPanel.tsx', 'utf8')
const form = readFileSync('components/listings/IntelligentListingForm.tsx', 'utf8')

test('stale drafts: scanner reuses the stale-deal pattern, not a separate reminder system', () => {
  assert.match(staleDeals, /Stale-Draft Scanner \(boss 08-31: reuse the stale-deal pattern/)
  assert.match(staleDeals, /export interface StaleDraftItem/)
  assert.match(staleDeals, /export async function findStaleDrafts\(agencyId: string, thresholdDays = 7\)/)
  assert.match(staleDeals, /\.in\('status', \['draft', 'changes_requested'\]\)/)
  assert.match(staleDeals, /\.lt\('updated_at', threshold\)/)
})

test('stale drafts: nudge is deduped per unread notification, never spam', () => {
  assert.match(staleDeals, /export async function nudgeStaleDrafts\(agencyId: string, thresholdDays = 7\)/)
  assert.match(staleDeals, /\.eq\('kind', 'draft_nudge'\)/)
  assert.match(staleDeals, /\.is\('read_at', null\)/)
  assert.match(staleDeals, /link: `\/dashboard\/studio\?listing=\$\{d\.id\}`/)
  assert.match(staleDeals, /if \(existing && existing\.length > 0\) \{ skipped \+= 1; continue \}/)
})

test('stale drafts: API route lists (GET) and nudges (POST) with agency gate', () => {
  assert.match(route, /findStaleDrafts, nudgeStaleDrafts/)
  assert.match(route, /GET  \/api\/stale\/drafts/)
  assert.match(route, /POST \/api\/stale\/drafts/)
  assert.match(route, /canManageAgency\(auth, agencyId\)/)
  assert.match(route, /const drafts = await findStaleDrafts\(agencyId, days\)/)
  assert.match(route, /const result = await nudgeStaleDrafts\(agencyId, days\)/)
})

test('stale drafts: panel surfaces parked drafts + nudge button on the listings dashboard', () => {
  assert.match(panel, /Parked drafts — waiting on seller input/)
  assert.match(panel, /authenticatedFetch\('\/api\/stale\/drafts\?days=7'\)/)
  assert.match(panel, /method: 'POST'/)
  assert.match(panel, /📨 Nudge sellers/)
  assert.match(panel, /dashboard\/studio\?listing=\$\{d\.id\}/)
  assert.match(dashboard, /import ParkedDraftsPanel/)
  assert.match(dashboard, /<ParkedDraftsPanel \/>/)
})

test('stale drafts: nudge kind renders in the notification center', () => {
  assert.match(notifications, /draft_nudge: '⏸️'/)
})

test('bugfix: post-create redirect points at /listings (was 404 /dashboard/listings)', () => {
  assert.doesNotMatch(form, /router\.push\('\/dashboard\/listings'\)/)
  assert.match(form, /router\.push\('\/listings'\)/)
})
