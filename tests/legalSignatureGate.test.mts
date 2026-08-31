/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Legal-doc signature gate + buyer NDA unified flow (boss 08-31 — same risk
// class as the BOV label gate: something that LOOKS compliant must actually BE
// signed).
//  1. The legal checklist only counts SIGNED documents (upload status
//     'signed'/'active' or generated docs fully signed) — presence alone never
//     satisfies the gate.
//  2. The publish gate reads listing_documents.status + documents.status.
//  3. The public buyer NDA renders the agency's OWN fillable NDA template when
//     one exists (agency-scoped), falling back to the platform default PDF.
//  4. A buyer NDA signature creates a pending data_room_access_request so the
//     existing agent-review → data-room unlock fires (one pipeline, not a
//     separate accountless side-path).
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const legalChecklist = readFileSync('lib/legalChecklist.ts', 'utf8')
const publish = readFileSync('lib/publish.ts', 'utf8')
const ndaRoute = readFileSync('app/api/public/nda/sign/route.ts', 'utf8')
const ndaAccess = readFileSync('lib/ndaAccess.ts', 'utf8')
const ndaPdf = readFileSync('lib/buyerFormPdf.server.ts', 'utf8')

test('legal: the gate only counts SIGNED uploads (status signed/active), never presence alone', () => {
  assert.match(legalChecklist, /\"on file\" is NOT enough/)
  assert.match(legalChecklist, /status === 'signed' \|\| d\.status === 'active'/)
  assert.match(legalChecklist, /signedUploads/)
  assert.match(legalChecklist, /An uploaded-but-unsigned scan \(status pending\/draft\/null\) does NOT count/)
})

test('legal: publish gate selects signature status on uploads AND generated docs', () => {
  assert.match(publish, /from\('listing_documents'\)\.select\('category, body_text, status'\)/)
  assert.match(publish, /from\('documents'\)\.select\('title, status'\)/)
  assert.match(publish, /unsigned scan must not unlock go-live/)
})

test('buyer NDA: renders the agency OWN fillable template when available', () => {
  assert.match(ndaRoute, /document_templates/)
  assert.match(ndaRoute, /\.eq\('agency_id', agencyIdForNda\)/)
  assert.match(ndaRoute, /\.ilike\('name', '%nda%'\)/)
  assert.match(ndaRoute, /buildDocumentPdfBase64/)
  assert.match(ndaRoute, /AGENCY TEMPLATE GATE \(boss 08-31\)/)
  // Fallback to the platform default PDF is still present.
  assert.match(ndaRoute, /generateNdaProfilePdf/)
})

test('buyer NDA: signature creates a pending agent-review access request (same flow as broker NDA)', () => {
  assert.match(ndaRoute, /data_room_access_requests/)
  assert.match(ndaRoute, /status: 'pending'/)
  assert.match(ndaRoute, /nda_signature: name/)
  assert.match(ndaRoute, /notifyAgencyBrokers/)
  assert.match(ndaRoute, /AGENT REVIEW → DATA-ROOM UNLOCK/)
})

test('buyer NDA: agent review → data-room unlock is the SAME pipeline (ndaAccess)', () => {
  assert.match(ndaAccess, /export async function notifyAgencyBrokers/)
  assert.match(ndaAccess, /data_room_buyers/)
  assert.match(ndaAccess, /reviewNdaRequest/)
  assert.match(ndaAccess, /data_room_access_requests/)
})
