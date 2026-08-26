/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { generateDigestForAgency } from '@/lib/dealDigest'

export const runtime = 'nodejs'

/**
 * /api/digest
 *
 * POST — authenticated broker triggers a weekly deal digest for their agency.
 *        Body: { agencyId }
 * GET  — authenticated; list digest history (optionally ?agencyId=)
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = typeof body.agencyId === 'string' && body.agencyId ? body.agencyId : ''
  if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId is required' }, { status: 400 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const summary = await generateDigestForAgency(agencyId)
  if (!summary.ok && summary.error === 'not configured') {
    return NextResponse.json({ ok: false, error: summary.error }, { status: 503 })
  }
  return NextResponse.json({ ok: true, ...summary })
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId')
  let query = db.from('deal_digests').select('*')
  if (agencyId) {
    if (!canManageAgency(auth, agencyId)) return forbiddenResponse()
    query = query.eq('agency_id', agencyId)
  }
  const { data, error } = await query.order('generated_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, digests: data || [] })
}
