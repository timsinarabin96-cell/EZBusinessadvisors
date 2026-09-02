/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse, canManageAgency } from '@/lib/supabase/auth'
import { trainingGateResponse } from '@/lib/trainingGate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET /api/listings/documents/signed-url?listingId=..|dealId=..&path=..&bucket=..
// Resolves a PRIVATE storage object to a short-lived signed URL at view time.
// Auth-gated: caller must be a member of the listing's agency (listingId
// direct, or dealId → deal → listing). Never returns a URL for an object the
// caller may not see.
// ---------------------------------------------------------------------------

const BUCKET = 'financial_docs'
const TTL_SECONDS = 3600 // 1 hour — enough for a preview/download session

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  const dealId = req.nextUrl.searchParams.get('dealId') || ''
  const path = req.nextUrl.searchParams.get('path') || ''
  const bucket = req.nextUrl.searchParams.get('bucket') || BUCKET

  if (!path || (!listingId && !dealId)) {
    return NextResponse.json({ ok: false, error: 'path and listingId or dealId are required' }, { status: 400 })
  }

  // IDOR guard: the caller must belong to the listing's agency.
  let agencyId: string | null = null
  if (listingId) {
    const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
    agencyId = listing?.agency_id || null
  } else {
    const { data: deal } = await db.from('deals').select('listing_id, agency_id').eq('id', dealId).maybeSingle()
    if (deal?.listing_id) {
      const { data: listing } = await db.from('listings').select('agency_id').eq('id', deal.listing_id).maybeSingle()
      agencyId = listing?.agency_id || deal.agency_id || null
    } else {
      agencyId = deal?.agency_id || null
    }
  }
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  const trainingBlock = await trainingGateResponse({ database: db, auth, agencyId, action: 'sensitive_document_access', targetType: 'listing', targetId: listingId || dealId })
  if (trainingBlock) return trainingBlock
  if (!canManageAgency(auth, agencyId)) {
    return NextResponse.json({ ok: false, error: 'Insufficient permission' }, { status: 403 })
  }

  const { data: signed, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, TTL_SECONDS)
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: error?.message || 'Could not sign the document' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl, expiresIn: TTL_SECONDS })
}
