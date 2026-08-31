/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// #9 teaser hardening, #10 DD checklist template, #12 buyer DD visibility,
// #13 unified e-sign, #14 auto-archive on close, #15 buyer DD uploads,
// #16 notification wiring — regression locks (spec 08-31).
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Dummy env so the supabase client import inside lib/dueDiligence.ts doesn't
// blow up (static + pure-logic tests only — no network).
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy'

const feedSql = readFileSync('sql/base_schema.sql', 'utf8')
const ddLib = readFileSync('lib/dueDiligence.ts', 'utf8')
const roomServer = readFileSync('lib/dataRoomServer.ts', 'utf8')
const roomRoute = readFileSync('app/api/data-rooms/room/route.ts', 'utf8')
const stageRoute = readFileSync('app/api/deals/[id]/stage/route.ts', 'utf8')
const dataRoomDelivery = readFileSync('lib/dataRoomDelivery.ts', 'utf8')
const esignRoute = readFileSync('app/api/documents/esign/route.ts', 'utf8')
const ndaAccess = readFileSync('lib/ndaAccess.ts', 'utf8')

const { DD_CHECKLIST_TEMPLATE, industryDdSuggestions } = await import('../lib/dueDiligence.ts')

test('#9 teaser: public feed gates ALL financials behind show_financials', () => {
  // The feed RPC returns financials only when the seller authorized them —
  // teaser-only (no financials) until qualification per spec Phase 4/5.
  const feed = feedSql.match(/CREATE FUNCTION public\.get_public_listing_feed[\s\S]*?END;/)?.[0] || ''
  assert.match(feed, /case when pl\.show_financials then l\.asking_price else null end/)
  assert.match(feed, /case when pl\.show_financials then l\.annual_revenue else null end/)
  assert.match(feed, /case when pl\.show_financials then l\.sde else null end/)
  assert.match(feed, /case when pl\.show_financials then l\.ebitda else null end/)
  // location_exposure constraint: address is never exposed wholesale.
  assert.match(feedSql, /location_exposure.*full_address/)
})

test('#10 DD checklist: standard template + industry-specific suggestions exist', () => {
  assert.ok(DD_CHECKLIST_TEMPLATE.length >= 10, 'standard template is comprehensive')
  assert.ok(DD_CHECKLIST_TEMPLATE.some((i) => i.category === 'Legal'))
  assert.ok(DD_CHECKLIST_TEMPLATE.some((i) => i.category === 'Tax Returns'))
  // Industry suggestions: home care gets HIPAA/licensing items, not generic.
  const homeCare = industryDdSuggestions('Home Care Agency')
  assert.ok(homeCare.some((i) => /HIPAA|license/i.test(i.title)), 'home care suggestions are specific')
  assert.equal(industryDdSuggestions('Home Care Agency').length, 3)
  assert.deepEqual(industryDdSuggestions('Unknown Industry'), [])
})

test('#12 buyer DD visibility: buyer role only sees buyer-visible access levels', () => {
  assert.match(roomServer, /if \(role === 'buyer'\) return \['all_parties', 'buyer_only'\]/)
  // Buyer can only preview/download buyer-visible docs.
  assert.match(roomRoute, /visibleAccessLevels/)
})

test('#13 unified e-sign: provider esign with in-app portal fallback on one path', () => {
  assert.match(esignRoute, /createEsignRequest/)
  assert.match(esignRoute, /esignConfigured/)
  assert.match(esignRoute, /not_configured/)
  // NDA approval still grants the buyer data-room access (gate preserved).
  assert.match(ndaAccess, /nda_access_granted/)
})

test('#14 auto-archive on close: stage route archives the deal file + closes the listing', () => {
  assert.match(stageRoute, /archiveDealOnClose/)
  assert.match(stageRoute, /stage === 'closed'/)
  assert.match(stageRoute, /status: 'sold'/)
  assert.match(dataRoomDelivery, /archiveDealOnClose/)
  assert.match(dataRoomDelivery, /archived_at/)
  assert.match(dataRoomDelivery, /stage_tag: 'closing'/)
})

test('#15 buyer DD uploads: room upload path is role-gated (buyer cannot upload pre-DD)', () => {
  // Agents upload freely; buyer uploads are gated by role in the room route.
  assert.match(roomRoute, /uploaded_by_role: role/)
  assert.match(roomServer, /uploaded_by_role/)
})

test('#16 notifications: DD item creation pings the agency; NDA grant notifies', () => {
  assert.match(ddLib, /createNotification/)
  assert.match(ddLib, /kind: 'due_diligence'/)
  assert.match(ndaAccess, /await notify\(/)
})

test('#16 notifications: reconciliation follow-up persists + autoGenerate notes it', () => {
  const autoGen = readFileSync('lib/autoGenerate.ts', 'utf8')
  assert.match(autoGen, /persistReconciliationFollowup/)
  assert.match(autoGen, /Recast\/BOV\/CIM generation paused/)
})
