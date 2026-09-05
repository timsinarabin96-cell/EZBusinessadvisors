/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { deleteDemandLetter, setDemandLetterStatus, type DemandLetterStatus } from '@/lib/demandLetters'

export const runtime = 'nodejs'

const STATUSES: DemandLetterStatus[] = ['draft', 'ready', 'archived']

/** PATCH /api/demand-letters/[id] { status } · DELETE — agency-scoped. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const { id } = await ctx.params

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data: letter } = await db.from('demand_letters').select('agency_id').eq('id', id).maybeSingle()
  if (!letter) return NextResponse.json({ ok: false, error: 'Letter not found' }, { status: 404 })
  if (!auth.memberships.some((m) => m.agency_id === (letter as { agency_id: string }).agency_id)) return forbiddenResponse()

  const body = await req.json().catch(() => ({}))
  const status: DemandLetterStatus = STATUSES.includes(body.status) ? body.status : 'draft'
  const ok = await setDemandLetterStatus(id, (letter as { agency_id: string }).agency_id, status)
  if (!ok) return NextResponse.json({ ok: false, error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const { id } = await ctx.params

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data: letter } = await db.from('demand_letters').select('agency_id').eq('id', id).maybeSingle()
  if (!letter) return NextResponse.json({ ok: false, error: 'Letter not found' }, { status: 404 })
  const agencyId = (letter as { agency_id: string }).agency_id
  if (!auth.memberships.some((m) => m.agency_id === agencyId)) return forbiddenResponse()

  const ok = await deleteDemandLetter(id, agencyId)
  if (!ok) return NextResponse.json({ ok: false, error: 'Delete failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
