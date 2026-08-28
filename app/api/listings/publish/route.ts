/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageListing, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { publishListing, schedulePublish } from '@/lib/publish'
import { setExpiry } from '@/lib/listingExpiry'

export const runtime = 'nodejs'

/**
 * POST /api/listings/publish
 *   { listingId, scheduleAt? }
 * Publishes a listing through the quality gate (readiness >= 70). When
 * scheduleAt is provided, sets publish_at instead (scheduled go-live).
 * On success fires the full blast: buyer-match alerts, seller/agency emails,
 * activity. Listing is auto-flagged for review when published below the
 * readiness threshold (force = go live anyway).
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const listingId = String(body?.listingId || '')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })

  const { data: listing } = await db.from('listings').select('agency_id, agent_id').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageListing(auth, listing)) return forbiddenResponse()

  // Scheduled publish.
  if (body.scheduleAt) {
    const res = await schedulePublish(listingId, String(body.scheduleAt))
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
    // Free window starts at go-live.
    const goLive = new Date(String(body.scheduleAt))
    await setExpiry(listingId, new Date(goLive.getTime() + 60 * 86400000).toISOString()).catch(() => {})
    return NextResponse.json({ ok: true, scheduled: true, publishAt: body.scheduleAt })
  }

  // Immediate publish (quality gate; force = go live anyway + auto-flag).
  const res = await publishListing(listingId, auth.user.id, { force: body.force === true })
  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      blocked: res.blocked,
      score: res.score,
      missing: res.missing || [],
      error: res.error,
    }, { status: res.blocked ? 422 : 500 })
  }

  // Free 2-month window starts now; renewal is $50/listing/month after.
  await setExpiry(listingId, new Date(Date.now() + 60 * 86400000).toISOString()).catch(() => {})
  return NextResponse.json({ ok: true, published: true, score: res.score, flagged: res.flagged || false, compliance: res.compliance || null, risk: res.risk || null })
}
