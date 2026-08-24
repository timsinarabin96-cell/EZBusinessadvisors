import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { generateDailyBrief } from '@/lib/dailyBrief'

export const runtime = 'nodejs'

/**
 * POST /api/daily-brief — manually send the "Today at a Glance" daily brief.
 * Body: { agencyId } — auth'd, agency-scoped. Used by the Notifications page
 * "Send daily brief" trigger and by brokers who want a test send.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body?.agencyId || '').trim()
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const brief = await generateDailyBrief(agencyId)
  if (!brief.ok) return NextResponse.json({ ok: false, error: brief.error || 'Brief generation failed' }, { status: 500 })

  return NextResponse.json({
    ok: true,
    recipients: brief.recipients,
    newBuyers: brief.newBuyers.length,
    newSellers: brief.newSellers.length,
    ndaSigners: brief.ndaSigners.length,
    expiring: brief.expiring.length,
    dealMoves: brief.dealMoves.length,
  })
}
