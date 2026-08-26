/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { reviewNdaRequest } from '@/lib/ndaAccess'

export const runtime = 'nodejs'

/**
 * POST /api/data-rooms/access-request/review
 * body: { requestId, action: 'approve' | 'reject', reviewNote? }
 * Broker-only. Approval grants the buyer data-room access + emails them.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (!body.requestId || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ ok: false, error: 'requestId and action (approve|reject) are required' }, { status: 400 })
  }

  const { data: ndaReq } = await db
    .from('data_room_access_requests')
    .select('agency_id')
    .eq('id', body.requestId)
    .maybeSingle()
  if (!ndaReq) return NextResponse.json({ ok: false, error: 'Request not found' }, { status: 404 })
  if (!canManageAgency(auth, ndaReq.agency_id)) return forbiddenResponse()

  const result = await reviewNdaRequest(body.requestId, body.action, auth.user.id, body.reviewNote || null)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
