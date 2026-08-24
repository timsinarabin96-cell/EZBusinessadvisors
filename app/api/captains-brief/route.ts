import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { generateCaptainsBrief } from '@/lib/captainsBrief'

export const runtime = 'nodejs'

/**
 * POST /api/captains-brief — manually send the Captain's Brief for an agency.
 * Body: { agencyId } — auth'd, agency-scoped. Used by the Notifications page
 * "Send Captain's Brief now" trigger and by brokers who want a test send.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body?.agencyId || '').trim()
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const brief = await generateCaptainsBrief(agencyId)
  if (!brief.ok) return NextResponse.json({ ok: false, error: brief.error || 'Brief generation failed' }, { status: 500 })

  return NextResponse.json({
    ok: true,
    recipients: brief.recipients,
    followUps: brief.followUps.length,
    expiring: brief.expiring.length,
    matches: brief.matches.length,
    commissions: brief.commissions.length,
  })
}
