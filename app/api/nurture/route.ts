/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { seedDefaultSequences, enroll } from '@/lib/nurture'

export const runtime = 'nodejs'

/**
 * /api/nurture
 *
 * GET  — authenticated broker lists sequences + recipients ?agencyId=
 * POST — authenticated broker either seeds default sequences
 *        ({ action: 'seed', agencyId }) or enrolls a contact
 *        ({ action: 'enroll', sequenceId, email, leadType? })
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId')
  if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId query param is required' }, { status: 400 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const [sequences, recipients] = await Promise.all([
    db.from('nurture_sequences').select('*').eq('agency_id', agencyId).order('created_at', { ascending: true }),
    db
      .from('nurture_recipients')
      .select('*, nurture_sequences(name, audience)')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  return NextResponse.json({
    ok: true,
    agencyId,
    sequences: sequences.data || [],
    recipients: recipients.data || [],
  })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))

  // Seed the two default sequences for an agency.
  if (body.action === 'seed') {
    const agencyId = typeof body.agencyId === 'string' ? body.agencyId : ''
    if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId is required' }, { status: 400 })
    if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

    const result = await seedDefaultSequences(agencyId)
    if (!result.ok) {
      const status = result.error === 'not configured' ? 503 : 400
      return NextResponse.json({ ok: false, error: result.error }, { status })
    }
    return NextResponse.json({ ok: true, created: result.created })
  }

  // Enroll a contact into a sequence.
  if (body.action === 'enroll') {
    const sequenceId = typeof body.sequenceId === 'string' ? body.sequenceId : ''
    const email = typeof body.email === 'string' ? body.email : ''
    const leadType = typeof body.leadType === 'string' ? body.leadType : 'buyer'
    if (!sequenceId || !email) {
      return NextResponse.json({ ok: false, error: 'sequenceId and email are required' }, { status: 400 })
    }

    const { data: sequence } = await db
      .from('nurture_sequences')
      .select('id, agency_id')
      .eq('id', sequenceId)
      .maybeSingle()
    if (!sequence) return NextResponse.json({ ok: false, error: 'sequence not found' }, { status: 404 })
    if (!canManageAgency(auth, sequence.agency_id)) return forbiddenResponse()

    const result = await enroll(sequenceId, email, leadType)
    if (!result.ok) {
      const status = result.error === 'not configured' ? 503 : 400
      return NextResponse.json({ ok: false, error: result.error }, { status })
    }
    return NextResponse.json({ ok: true, recipient: result.data }, { status: 201 })
  }

  return NextResponse.json({ ok: false, error: "action must be 'seed' or 'enroll'" }, { status: 400 })
}
