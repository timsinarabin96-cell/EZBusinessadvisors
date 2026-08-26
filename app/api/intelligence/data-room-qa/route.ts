/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { askQuestion, listQuestions } from '@/lib/dataRoomQa'

export const runtime = 'nodejs'

/**
 * /api/intelligence/data-room-qa
 *
 * GET  ?agencyId=...&dataRoomId=...  — list Q&A history for an agency (optionally
 *      filtered to one data room). Pass &action=rooms to list the agency's data
 *      rooms for the picker (data_rooms -> listings.agency_id).
 * POST { dataRoomId, question }      — ask a question about a data room and get
 *      a deterministic (or AI-polished) answer persisted as a Q&A row.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || ''
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  // Data room picker: list the agency's data rooms (joined through listings).
  if (req.nextUrl.searchParams.get('action') === 'rooms') {
    const { data, error } = await db
      .from('data_rooms')
      .select('id, name, status, listing_id, listings(agency_id, business_name)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const rooms = ((data || []) as Array<Record<string, any>>)
      .filter((r) => r.listings?.agency_id === agencyId)
      .map((r) => ({
        id: r.id,
        name: r.name || 'Untitled data room',
        status: r.status || 'active',
        businessName: r.listings?.business_name || null,
      }))
    return NextResponse.json({ ok: true, rooms })
  }

  const dataRoomId = req.nextUrl.searchParams.get('dataRoomId') || undefined
  const questions = await listQuestions(agencyId, dataRoomId)
  return NextResponse.json({ ok: true, questions })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = (await req.json().catch(() => null)) as { dataRoomId?: string; question?: string } | null
  const dataRoomId = body?.dataRoomId || ''
  const question = (body?.question || '').trim()
  if (!dataRoomId || !question) {
    return NextResponse.json({ ok: false, error: 'dataRoomId and question are required' }, { status: 400 })
  }

  // Verify the caller manages the agency that owns the data room.
  const { data: room } = await db
    .from('data_rooms')
    .select('id, listings(agency_id)')
    .eq('id', dataRoomId)
    .maybeSingle()
  const agencyId = (room as { listings?: { agency_id?: string } | null } | null)?.listings?.agency_id
  if (!room || !agencyId) return NextResponse.json({ ok: false, error: 'Data room not found' }, { status: 404 })
  if (!canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const result = await askQuestion(dataRoomId, question)
  if (!result.ok || !result.row) {
    return NextResponse.json({ ok: false, error: result.error || 'Question failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, question: result.row })
}
