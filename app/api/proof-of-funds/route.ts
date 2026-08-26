/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { submitPoF, reviewPoF, listPoF } from '@/lib/proofOfFunds'

export const runtime = 'nodejs'

/**
 * /api/proof-of-funds
 *
 * POST  — public buyer submits proof of funds (no auth).
 *         Body: { email, name?, listingId, amount?, documentUrl? }
 * GET   — authenticated broker lists submissions ?agencyId=&status=
 * PATCH — authenticated broker reviews { id, action: 'verified'|'rejected', notes? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const result = await submitPoF({
    email: typeof body.email === 'string' ? body.email : '',
    name: typeof body.name === 'string' ? body.name : null,
    listingId: typeof body.listingId === 'string' ? body.listingId : '',
    amount: typeof body.amount === 'number' ? body.amount : null,
    documentUrl: typeof body.documentUrl === 'string' ? body.documentUrl : null,
  })
  if (!result.ok) {
    const status = result.error === 'not configured' ? 503 : result.error === 'listing not found' ? 404 : 400
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }
  return NextResponse.json({ ok: true, submission: result.data }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId')
  if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId query param is required' }, { status: 400 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const status = req.nextUrl.searchParams.get('status')
  const submissions = await listPoF(agencyId, status)
  return NextResponse.json({ ok: true, agencyId, submissions })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const action = body.action
  if (!id || !['verified', 'rejected'].includes(action || '')) {
    return NextResponse.json({ ok: false, error: 'id and action (verified|rejected) are required' }, { status: 400 })
  }

  const { data: existing } = await db.from('proof_of_funds').select('id, agency_id').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'submission not found' }, { status: 404 })
  if (!canManageAgency(auth, existing.agency_id)) return forbiddenResponse()

  const result = await reviewPoF(id, action as 'verified' | 'rejected', auth.user.id, typeof body.notes === 'string' ? body.notes : null)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, submission: result.data })
}
