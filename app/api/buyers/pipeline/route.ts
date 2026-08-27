/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { fetchPipelineBoard, moveBuyerStage, submitNqa, setCompetitiveBoard } from '@/lib/buyerPipeline'
import { BUYER_STAGES } from '@/lib/buyerPipelineCore'

export const runtime = 'nodejs'

// =============================================================================
// /api/buyers/pipeline — buyer pipeline CRM
// -----------------------------------------------------------------------------
// GET   ?listingId=              → kanban board (buyers + heat + events + funnel)
// PATCH { buyerListId, listingId, toStage, note? } → move stage (auto-logged)
// POST  { action: 'nqa', listingId, buyerListId, answers } → score + auto-qualify
// POST  { action: 'competitive', listingId, enabled } → seller-consent flag
// All agency-scoped; caller must belong to the listing's agency.
// =============================================================================

const moveSchema = z.object({
  buyerListId: z.string().uuid(),
  listingId: z.string().uuid(),
  toStage: z.enum(BUYER_STAGES),
  note: z.string().max(500).optional().nullable(),
})

const nqaSchema = z.object({
  action: z.literal('nqa'),
  listingId: z.string().uuid(),
  buyerListId: z.string().uuid(),
  answers: z.record(z.string(), z.string().max(500)).default({}),
})

const compSchema = z.object({
  action: z.literal('competitive'),
  listingId: z.string().uuid(),
  enabled: z.boolean(),
})

async function resolveAgency(db: any, auth: any, listingId: string): Promise<{ agencyId: string | null; error?: NextResponse }> {
  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
  if (!agencyId) return { agencyId: null, error: NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 }) }
  if (!canManageAgency(auth, agencyId)) return { agencyId: null, error: forbiddenResponse() }
  return { agencyId }
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId query param is required' }, { status: 400 })

  const { agencyId, error } = await resolveAgency(db, auth, listingId)
  if (error) return error

  const result = await fetchPipelineBoard(db, listingId, agencyId!)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, board: result.board })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = moveSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Validation failed: buyerListId, listingId, toStage required' }, { status: 422 })

  const { listingId, buyerListId, toStage, note } = parsed.data
  const { agencyId, error } = await resolveAgency(db, auth, listingId)
  if (error) return error

  const result = await moveBuyerStage(db, {
    agencyId: agencyId!,
    listingId,
    buyerListId,
    toStage,
    note,
    userId: auth.user.id,
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  // NQA submission
  const nqa = nqaSchema.safeParse(body)
  if (nqa.success) {
    const { listingId, buyerListId, answers } = nqa.data
    const { agencyId, error } = await resolveAgency(db, auth, listingId)
    if (error) return error
    const result = await submitNqa(db, { agencyId: agencyId!, listingId, buyerListId, answers })
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, score: result.score, verdict: result.verdict, label: result.label })
  }

  // Competitive board consent
  const comp = compSchema.safeParse(body)
  if (comp.success) {
    const { listingId, enabled } = comp.data
    const { agencyId, error } = await resolveAgency(db, auth, listingId)
    if (error) return error
    const result = await setCompetitiveBoard(db, listingId, enabled)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
