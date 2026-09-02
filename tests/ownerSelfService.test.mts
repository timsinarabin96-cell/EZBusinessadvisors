import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// Owner self-service: edit listing details + broker-approved price change.
// Static/source assertions in the same style as the rest of this suite —
// guards authorization, hard-locked money fields, audit logging, and the
// meta-based approval flow's invariants (never writes asking_price directly
// from the owner route; only the broker route may).
// =============================================================================

const ownerEdit = readFileSync('app/api/owner/listings/[id]/route.ts', 'utf8')
const ownerPrice = readFileSync('app/api/owner/listings/[id]/price/route.ts', 'utf8')
const brokerPrice = readFileSync('app/api/listings/[id]/price/route.ts', 'utf8')
const reviewQueuePage = readFileSync('app/dashboard/review-queue/page.tsx', 'utf8')
const ownerPage = readFileSync('app/dashboard/owner/page.tsx', 'utf8')

test('owner edit route: authorizes via owner_email or seller_listing_orders, rejects non-owner', () => {
  assert.match(ownerEdit, /authenticateRequest/)
  assert.match(ownerEdit, /owner_email === user\.email/)
  assert.match(ownerEdit, /seller_listing_orders/)
  assert.match(ownerEdit, /You do not own this listing/)
  assert.match(ownerEdit, /status: 403/)
})

test('owner edit route: hard-locks money/financials/status/agency fields', () => {
  for (const field of ['asking_price', 'annual_revenue', 'sde', 'ebitda', 'financials_status', 'status', 'review_stage', 'compliance_status', 'agency_id', 'agent_id', 'owner_email']) {
    assert.match(ownerEdit, new RegExp(`'${field}'`), `expected ${field} in LOCKED_FIELDS`)
  }
  assert.match(ownerEdit, /LOCKED_FIELDS/)
  assert.match(ownerEdit, /cannot be changed here/)
})

test('owner edit route: only allows safe public fields + audits with a diff', () => {
  for (const field of ['business_name', 'industry', 'sub_industry', 'location_general', 'description', 'public_highlights', 'image_urls']) {
    assert.match(ownerEdit, new RegExp(`'${field}'`))
  }
  assert.match(ownerEdit, /recordAdminAudit/)
  assert.match(ownerEdit, /owner_edited_listing/)
  assert.match(ownerEdit, /changed/)
})

test('owner edit route: re-review trigger sends live listings back to draft/changes_requested', () => {
  assert.match(ownerEdit, /RETRIGGERS_REVIEW/)
  assert.match(ownerEdit, /changes_requested/)
  assert.match(ownerEdit, /patch\.status = 'draft'/)
})

test('owner price route: writes pending_price_change on ai_metadata, never touches asking_price', () => {
  assert.match(ownerPrice, /authenticateRequest/)
  assert.match(ownerPrice, /owner_email === user\.email/)
  assert.match(ownerPrice, /pending_price_change/)
  assert.match(ownerPrice, /owner_requested_price_change/)
  // The update payload must only set ai_metadata — no asking_price key in the update call.
  const updateBlock = ownerPrice.slice(ownerPrice.indexOf(".update({"), ownerPrice.indexOf(".update({") + 200)
  assert.doesNotMatch(updateBlock, /asking_price:/)
  assert.match(ownerPrice, /asking_price is required and must be greater than 0/)
})

test('owner price route: validates asking_price > 0', () => {
  assert.match(ownerPrice, /askingPrice <= 0/)
  assert.match(ownerPrice, /Number\.isFinite\(askingPrice\)/)
})

test('broker price approval route: reuses canManageListing authorization from review flow', () => {
  assert.match(brokerPrice, /canManageListing/)
  assert.match(brokerPrice, /authenticateProfileRequest/)
  assert.match(brokerPrice, /forbiddenResponse/)
})

test('broker price approval route: approve applies asking_price + clears meta + audits + notifies', () => {
  assert.match(brokerPrice, /patch\.asking_price = pending\.asking_price/)
  assert.match(brokerPrice, /delete restMeta\.pending_price_change/)
  assert.match(brokerPrice, /owner_price_change_approved/)
  assert.match(brokerPrice, /createNotification/)
  assert.match(brokerPrice, /sendEmail/)
})

test('broker price approval route: reject clears meta + audits + notifies, does not touch asking_price', () => {
  assert.match(brokerPrice, /owner_price_change_rejected/)
  const rejectIdx = brokerPrice.indexOf("action === 'approve'")
  assert.ok(rejectIdx > -1)
  // reject path only sets ai_metadata/updated_at in patch (asking_price only under the approve branch)
  assert.match(brokerPrice, /if \(action === 'approve'\) \{\s*patch\.asking_price = pending\.asking_price\s*\}/)
})

test('broker price approval route: 404s when no pending request exists', () => {
  assert.match(brokerPrice, /No pending price change on this listing/)
})

test('broker price approval route: best-effort buyer ripple via existing watchlist matcher on approval', () => {
  assert.match(brokerPrice, /runWatchlistMatching/)
})

test('review queue page surfaces pending price change requests with approve/reject', () => {
  assert.match(reviewQueuePage, /pending_price_change/)
  assert.match(reviewQueuePage, /Pending price changes/)
  assert.match(reviewQueuePage, /\/api\/listings\/\$\{id\}\/price/)
  assert.match(reviewQueuePage, /actPrice/)
})

test('owner dashboard: edit listing + change price actions wired, pending chip logic present', () => {
  assert.match(ownerPage, /Edit listing/)
  assert.match(ownerPage, /Change price/)
  assert.match(ownerPage, /\/api\/owner\/listings\/\$\{listing\.id\}/)
  assert.match(ownerPage, /\/api\/owner\/listings\/\$\{listingId\}\/price/)
  assert.match(ownerPage, /Price change pending review/)
  assert.match(ownerPage, /ai_metadata\?\.pending_price_change/)
})

test('owner dashboard: price button disabled while a request is already pending', () => {
  assert.match(ownerPage, /disabled=\{Boolean\(l\.ai_metadata\?\.pending_price_change\)\}/)
})
