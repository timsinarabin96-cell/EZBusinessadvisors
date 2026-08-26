/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { fetchRoomIntent } from '@/lib/dataRoomIntent'

export const runtime = 'nodejs'

/**
 * GET /api/data-rooms/intent?roomId=...
 * Broker-gated: returns the data room's buyer-intelligence rollup —
 *   buyers: [{ email, views, downloads, distinctDocs, categories, lastActiveAt, score }]
 *   topDocs: [{ fileId, fileName, fileKind, views, downloads, lastViewedAt }]
 * The caller must manage the agency that owns the room's listing.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const roomId = req.nextUrl.searchParams.get('roomId') || ''
  if (!roomId) return NextResponse.json({ ok: false, error: 'roomId is required' }, { status: 400 })

  const { data: room } = await db
    .from('data_rooms')
    .select('id, listings(agency_id)')
    .eq('id', roomId)
    .maybeSingle()
  const roomAny = room as unknown as { listings?: { agency_id: string } | null } | null
  const agencyId = roomAny?.listings?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Data room not found' }, { status: 404 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const result = await fetchRoomIntent(roomId)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, intent: result.intent })
}
