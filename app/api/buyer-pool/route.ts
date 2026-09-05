/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { loadUnifiedBuyerPool, summarizePool } from '@/lib/buyerPool'

export const runtime = 'nodejs'

/**
 * Unified Buyer Pool API
 * GET /api/buyer-pool?agencyId=... — one deduplicated buyer list merging CRM
 * buyer_leads + marketplace buyer profiles + saved-search watchlists.
 * Read-only and agency-scoped.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!auth.memberships.some((m) => m.agency_id === agencyId)) {
    return NextResponse.json({ ok: false, error: 'Not a member of this agency' }, { status: 403 })
  }

  const pool = await loadUnifiedBuyerPool(agencyId)
  const summary = summarizePool(pool)
  return NextResponse.json({ ok: true, summary, pool })
}
