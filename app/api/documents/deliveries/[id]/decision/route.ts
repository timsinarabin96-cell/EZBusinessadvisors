/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { approveDelivery, rejectDelivery } from '@/lib/docDelivery'
import { trainingGateResponse } from '@/lib/trainingGate'

export const runtime = 'nodejs'

/**
 * POST /api/documents/deliveries/[id]/decision
 * body: { action: 'approve' | 'reject', agencyId, reason? }
 * The single-tap approval gate: Approve triggers the REAL send (PDF upload →
 * email with attachment → Deal Room → share link). Reject records the reason
 * and sends nothing. Only owner/admin (canManageAgency) may decide.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const agencyId = String(body.agencyId || auth.memberships[0]?.agency_id || '')
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

  // The delivery must belong to the caller's agency.
  const { data: delivery } = await db.from('doc_deliveries').select('agency_id, status').eq('id', id).maybeSingle()
  if (!delivery) return NextResponse.json({ ok: false, error: 'Delivery not found' }, { status: 404 })
  if (delivery.agency_id !== agencyId) return forbiddenResponse()
  const trainingBlock = await trainingGateResponse({ database: db, auth, agencyId, body, action: 'buyer_document_delivery_approval', targetType: 'document_delivery', targetId: id })
  if (trainingBlock) return trainingBlock

  const action = String(body.action || '')
  if (action === 'approve') {
    const result = await approveDelivery(id, auth.user.id)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, delivery: result.delivery })
  }
  if (action === 'reject') {
    const result = await rejectDelivery(id, body.reason ? String(body.reason) : undefined)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, delivery: result.delivery })
  }
  return NextResponse.json({ ok: false, error: 'action must be approve or reject' }, { status: 400 })
}
