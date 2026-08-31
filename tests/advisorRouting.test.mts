/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Advisor-routing hook regression locks (boss 08-31): the free-tier decline is
// NOT a dead end. The interview route exposes advisorRouting on the 403/GET
// manual_path responses; the modal turns that decline into the AdvisorRoutingCard
// lead capture; the capture route records a seller lead (source
// 'advisor_routing') + notifies the agency. Locks each piece + the wiring.
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync('app/api/advisor/routing/route.ts', 'utf8')
const interview = readFileSync('app/api/advisor/interview/route.ts', 'utf8')
const card = readFileSync('components/listings/AdvisorRoutingCard.tsx', 'utf8')
const modal = readFileSync('components/listings/ListingIntakeModal.tsx', 'utf8')
const tiers = readFileSync('lib/sellerTiers.ts', 'utf8')

test('advisor-routing: free tier exposes the advisorRouting flag (spec Phase 4)', () => {
  assert.match(tiers, /advisorRouting: boolean/)
  assert.match(tiers, /advisorRouting: true/)
  assert.match(tiers, /advisorRouting: false/)
})

test('advisor-routing: interview 403 + manual_path responses carry advisorRouting', () => {
  assert.match(interview, /sellerTierConfig, type SellerTierId/)
  assert.match(interview, /advisorRouting: sellerTierConfig\(tier\)\.advisorRouting/)
  // both the seed 403 and the GET manual_path response include it
  const occurrences = (interview.match(/advisorRouting: sellerTierConfig\(tier\)\.advisorRouting/g) || []).length
  assert.ok(occurrences >= 2, `expected >=2 advisorRouting flags, got ${occurrences}`)
})

test('advisor-routing: capture route records a seller lead (source advisor_routing) + notifies', () => {
  assert.match(route, /advisor-routing hook \(boss 08-31\)/)
  assert.match(route, /source: 'advisor_routing'/)
  assert.match(route, /from\('seller_leads'\)\.insert/)
  assert.match(route, /createNotification\(\{/)
  assert.match(route, /kind: 'review'/)
  assert.match(route, /Free-tier seller declined AI intake — wants to work with a licensed advisor/)
})

test('advisor-routing: modal turns the 403 decline into the card, not a bare error', () => {
  assert.match(modal, /import AdvisorRoutingCard/)
  assert.match(modal, /declinedFreeTier = true/)
  assert.match(modal, /res\.status === 403 && j\?\.aiIntakeAllowed === false && j\?\.advisorRouting === true/)
  assert.match(modal, /setShowAdvisor\(true\)/)
  assert.match(modal, /<AdvisorRoutingCard onClose=\{\(\) => setShowAdvisor\(false\)\} compact \/>/)
})

test('advisor-routing: card posts to the capture route and shows success', () => {
  assert.match(card, /Free listing\? Work with a licensed advisor/)
  assert.match(card, /\/api\/advisor\/routing/)
  assert.match(card, /Request an advisor/)
  assert.match(card, /A licensed advisor will reach out shortly/)
})
