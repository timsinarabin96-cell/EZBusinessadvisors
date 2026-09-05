/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateProfileRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { recentQualificationEvents, runRequalification } from '@/lib/leadRequalify'

export const runtime = 'nodejs'

/**
 * Lead Re-qualification API (in-app, advisory — no emails ever).
 * GET  /api/leads/re-qualify?agencyId=... — recent qualification events
 * POST /api/leads/re-qualify              — run re-qualification now
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  const events = await recentQualificationEvents(agencyId)
  return NextResponse.json({ ok: true, events })
}

export async function POST(req: NextRequest) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!auth.memberships.some((m) => m.agency_id === agencyId)) return forbiddenResponse()

  const summary = await runRequalification(agencyId, auth.user.id)
  if (!summary.ok) return NextResponse.json({ ok: false, error: summary.error }, { status: 500 })
  return NextResponse.json({ ok: true, ...summary })
}
