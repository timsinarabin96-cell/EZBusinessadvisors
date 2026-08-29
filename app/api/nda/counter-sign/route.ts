/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { counterSignDocument } from '@/lib/documentCounterSign'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/nda/counter-sign — broker approves an NDA from the dashboard. */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const documentId = String(body.documentId || '').trim()
  if (!documentId) return NextResponse.json({ ok: false, error: 'documentId is required' }, { status: 400 })

  const res = await counterSignDocument(db, auth, documentId)
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status || 400 })
  return NextResponse.json({ ok: true, allSigned: res.allSigned, documentId })
}
