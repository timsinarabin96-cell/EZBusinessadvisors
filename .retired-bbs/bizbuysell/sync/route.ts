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
import { buildBbsPayload, recordWebhookEvent } from '@/lib/bbs'

export const runtime = 'nodejs'

const syncSchema = z.object({
  listingId: z.string().uuid(),
})

/**
 * POST /api/bizbuysell/sync — one-click push of an approved listing to
 * BizBuySell. Requires an approved listing and agency credentials.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const parsed = syncSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed', detail: parsed.error.issues[0]?.message }, { status: 422 })
  }
  const { listingId } = parsed.data

  const { data: listing } = await db
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .maybeSingle()

  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(authenticated, listing.agency_id)) return forbiddenResponse()

  // Only approved listings may go to a public marketplace.
  if (!['approved', 'active', 'published'].includes(listing.status)) {
    return NextResponse.json(
      { ok: false, error: 'Only approved listings can be posted to BizBuySell.' },
      { status: 409 },
    )
  }

  const credentials = await db
    .from('marketplace_connections')
    .select('*')
    .eq('agency_id', listing.agency_id)
    .eq('provider', 'bizbuysell')
    .eq('status', 'connected')
    .maybeSingle()

  if (!credentials?.data) {
    // No live credentials: record the intent so the sync dashboard shows it,
    // and return a clear message about configuring the connection.
    await recordWebhookEvent('bizbuysell', 'sync.requested', {
      listingId,
      businessName: listing.business_name,
      note: 'connection not configured — queued for manual sync',
    })
    return NextResponse.json({
      ok: false,
      error: 'BizBuySell is not connected for this agency yet. Connect your BizBuySell account first.',
      code: 'BBS_NOT_CONNECTED',
    }, { status: 400 })
  }

  // Build the payload and record the sync attempt.
  const payload = buildBbsPayload(listing)
  await db.from('bbs_syncs').insert({
    agency_id: listing.agency_id,
    listing_id: listing.id,
    payload,
    status: 'pending',
  })

  return NextResponse.json({
    ok: true,
    message: 'Listing queued for BizBuySell publication.',
    payload,
  })
}
