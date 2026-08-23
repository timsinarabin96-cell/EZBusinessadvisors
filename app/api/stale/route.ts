import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { findStaleDeals } from '@/lib/staleDeals'

export const runtime = 'nodejs'

/** GET /api/stale?agencyId=...&days=14 — entities not contacted in N days. */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days')) || 14))
  const stale = await findStaleDeals(agencyId, days)
  return NextResponse.json({ ok: true, days, stale })
}
