/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { fetchActivityFeed } from '@/lib/activityFeed'

export const runtime = 'nodejs'

/** GET /api/activity?agencyId=...&limit=... — unified audit feed for an agency. */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  // Any agency member may read the feed (nav shows Activity at minRole 'agent').
  const isMember = auth.memberships.some((m) => m.agency_id === agencyId)
  if (!isMember) return forbiddenResponse()

  const limit = Math.min(200, Number(req.nextUrl.searchParams.get('limit')) || 50)
  const items = await fetchActivityFeed(agencyId, limit)
  return NextResponse.json({ ok: true, items })
}
