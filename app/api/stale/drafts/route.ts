/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { findStaleDrafts, nudgeStaleDrafts } from '@/lib/staleDeals'

export const runtime = 'nodejs'

/**
 * GET  /api/stale/drafts?agencyId=...&days=7 — draft listings untouched past N
 *      days (parked waiting on seller input). Same pattern as /api/stale.
 * POST /api/stale/drafts { agencyId?, days? } — fire deduped nudge
 *      notifications to the owning agents of stale drafts.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days')) || 7))
  const drafts = await findStaleDrafts(agencyId, days)
  return NextResponse.json({ ok: true, days, drafts })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const agencyId = String(body?.agencyId || '') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const days = Math.max(1, Math.min(365, Number(body?.days) || 7))
  const result = await nudgeStaleDrafts(agencyId, days)
  return NextResponse.json({ ok: true, ...result })
}
