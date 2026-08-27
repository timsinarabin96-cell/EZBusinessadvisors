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
import { schedulePostCloseSequence, fetchDueCheckins, updateCheckin } from '@/lib/postCloseEngine'

export const runtime = 'nodejs'

// =============================================================================
// /api/post-close — golden-referral engine
// -----------------------------------------------------------------------------
// GET   ?agencyId=            → due/sent check-ins for the agency
// POST  { action: 'schedule', listingId, closedAt, sellerName?, ... } → schedule
//       the 90-day / referral / testimonial / yearly sequence for a closed deal
// PATCH { checkinId, status, reply?, convertedListingId? } → update a check-in
// =============================================================================

const scheduleSchema = z.object({
  action: z.literal('schedule'),
  listingId: z.string().uuid(),
  closedAt: z.string(),
  sellerName: z.string().max(200).optional().nullable(),
  sellerEmail: z.string().max(300).optional().nullable(),
  buyerName: z.string().max(200).optional().nullable(),
  buyerEmail: z.string().max(300).optional().nullable(),
})

const patchSchema = z.object({
  checkinId: z.string().uuid(),
  status: z.enum(['sent', 'replied', 'converted', 'skipped']).optional(),
  reply: z.string().max(2000).optional(),
  convertedListingId: z.string().uuid().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const result = await fetchDueCheckins(db, agencyId)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, items: result.items })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = scheduleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Validation failed: listingId + closedAt + action=schedule' }, { status: 422 })
  const { listingId, closedAt, sellerName, sellerEmail, buyerName, buyerEmail } = parsed.data

  const { data: listing } = await db.from('listings').select('agency_id, business_name, seller_name, seller_email').eq('id', listingId).maybeSingle()
  const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const result = await schedulePostCloseSequence(db, {
    agencyId,
    listingId,
    sellerName: sellerName || (listing as any)?.seller_name || null,
    sellerEmail: sellerEmail || (listing as any)?.seller_email || null,
    buyerName: buyerName || null,
    buyerEmail: buyerEmail || null,
    closedAt,
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, created: result.created })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Validation failed: checkinId required' }, { status: 422 })
  const { checkinId, status, reply, convertedListingId } = parsed.data

  const { data: row } = await db.from('post_close_checkins').select('agency_id').eq('id', checkinId).maybeSingle()
  const agencyId = (row as { agency_id?: string | null } | null)?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Check-in not found' }, { status: 404 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const result = await updateCheckin(db, agencyId, checkinId, { status, reply, convertedListingId })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
