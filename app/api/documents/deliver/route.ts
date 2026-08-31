/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createDelivery, type DocKind } from '@/lib/docDelivery'

export const runtime = 'nodejs'

/**
 * POST /api/documents/deliver
 * body: { agencyId, listingId, dealId?, docKind: 'cim'|'bov'|'recast',
 *         recipientName?, recipientEmail, recipientRole? }
 * Creates a delivery in `pending_approval`. NOTHING is sent yet — the broker
 * must single-tap Approve in the approval queue to trigger the real send.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body.agencyId || auth.memberships[0]?.agency_id || '')
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

  const docKind = String(body.docKind || '')
  if (!['cim', 'bov', 'recast'].includes(docKind)) {
    return NextResponse.json({ ok: false, error: 'docKind must be cim, bov, or recast' }, { status: 400 })
  }
  const recipientEmail = String(body.recipientEmail || '').trim()
  if (!recipientEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return NextResponse.json({ ok: false, error: 'A valid recipientEmail is required' }, { status: 400 })
  }
  const listingId = String(body.listingId || '')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  const result = await createDelivery({
    agencyId,
    listingId,
    dealId: body.dealId ? String(body.dealId) : null,
    docKind: docKind as DocKind,
    recipientName: body.recipientName ? String(body.recipientName) : null,
    recipientEmail,
    recipientRole: body.recipientRole === 'seller' ? 'seller' : body.recipientRole === 'other' ? 'other' : 'buyer',
  })

  if (!result.ok || !result.delivery) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ ok: true, delivery: result.delivery }, { status: 201 })
}

/**
 * GET /api/documents/deliver?agencyId=...&status=pending_approval
 * Lists deliveries (approval queue + history) for the caller's agency.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

  const status = req.nextUrl.searchParams.get('status') || undefined
  const { listDeliveries } = await import('@/lib/docDelivery')
  const deliveries = await listDeliveries(agencyId, status as any)
  return NextResponse.json({ ok: true, deliveries })
}
