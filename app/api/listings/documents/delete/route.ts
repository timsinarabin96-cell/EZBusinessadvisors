/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * POST /api/listings/documents/delete
 * Deletes a listing document: removes the storage object AND the row.
 * Body: { listingId, docId, fileUrl? }
 * Auth: any signed-in profile (RLS already restricts listing access).
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const listingId = String(body?.listingId || '')
  const docId = String(body?.docId || '')
  const fileUrl = String(body?.fileUrl || '')
  if (!listingId || !docId) {
    return NextResponse.json({ ok: false, error: 'listingId and docId required' }, { status: 400 })
  }

  // 1) Remove the storage object when the URL points into the documents bucket.
  if (fileUrl) {
    try {
      const marker = '/storage/v1/object/public/documents/'
      const idx = fileUrl.indexOf(marker)
      if (idx !== -1) {
        const path = fileUrl.slice(idx + marker.length).split('?')[0]
        await db.storage.from('documents').remove([path])
      }
    } catch { /* storage removal is best-effort */ }
  }

  // 2) Delete the row.
  const { error } = await db.from('listing_documents').delete().eq('id', docId).eq('listing_id', listingId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
