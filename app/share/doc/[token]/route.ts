/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /share/doc/[token] — secure delivery share link.
 * Resolves the token to a SENT delivery and streams the stored PDF. Only works
 * for deliveries that actually went out (status = 'sent'), so a token can
 * never expose a document that was created but rejected or never approved.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data: delivery } = await db.from('doc_deliveries').select('*').eq('share_token', token).maybeSingle()
  if (!delivery || delivery.status !== 'sent' || !delivery.storage_path) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }

  const { data: signed } = await db.storage.from('documents').createSignedUrl(delivery.storage_path, 60 * 5)
  if (!signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: 'File unavailable' }, { status: 404 })
  }

  // Stream the signed URL through so the browser shows the PDF inline.
  return NextResponse.redirect(signed.signedUrl, { status: 307 })
}
