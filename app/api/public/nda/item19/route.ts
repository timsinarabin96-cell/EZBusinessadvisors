/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { DOCS_BUCKET } from '@/lib/storageBuckets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// GET /api/public/nda/item19?listingId=&token= — returns a short-lived signed
// URL for a franchise listing's Item 19 (Financial Performance
// Representation) PDF, ONLY if the token matches a recorded NDA signature for
// that exact listing. Mirrors /api/public/nda/financials: the public feed
// never carries the file; the NDA token is the only key that unlocks it.
// ---------------------------------------------------------------------------

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

export async function GET(req: NextRequest) {
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!listingId || !token) {
    return NextResponse.json({ ok: false, error: 'Missing listingId or token.' }, { status: 400 })
  }

  // Only a live, published listing may expose the document.
  const { data: feed } = await svc.rpc('get_public_listing_feed', { p_slug: listingId })
  if (!Array.isArray(feed) || feed.length === 0) {
    return NextResponse.json({ ok: false, error: 'Listing not found.' }, { status: 404 })
  }

  // NDA gate: the token must match a recorded signature for THIS listing.
  const { data: signature } = await svc
    .from('listing_nda_signatures')
    .select('id')
    .eq('listing_id', listingId)
    .eq('unlock_token', token)
    .maybeSingle()
  if (!signature) {
    return NextResponse.json({ ok: false, error: 'No valid NDA on file for this listing.' }, { status: 403 })
  }

  // Resolve the Item 19 document (franchise_details → listing_documents).
  const { data: details } = await svc
    .from('franchise_details')
    .select('item19_document_id')
    .eq('listing_id', listingId)
    .maybeSingle()
  const docId = details?.item19_document_id
  if (!docId) {
    return NextResponse.json({ ok: false, error: 'No Item 19 disclosure on file for this listing.' }, { status: 404 })
  }

  const { data: doc } = await svc
    .from('listing_documents')
    .select('file_name, storage_path')
    .eq('id', docId)
    .maybeSingle()
  const storagePath = doc?.storage_path
  if (!storagePath) {
    return NextResponse.json({ ok: false, error: 'Item 19 file is missing.' }, { status: 404 })
  }

  const { data: signed } = await svc.storage.from(DOCS_BUCKET).createSignedUrl(storagePath, 3600)
  if (!signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: 'Could not open the document. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl, fileName: doc?.file_name || 'Item-19.pdf' })
}
