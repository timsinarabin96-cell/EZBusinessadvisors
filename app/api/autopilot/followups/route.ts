import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { findFollowUpLeads, sendFollowUpText } from '@/lib/followups'

export const runtime = 'nodejs'

/**
 * /api/autopilot/followups
 *
 * GET  — leads with no reply in N days (default 3). ?days=&agencyId=
 * POST — { kind, leadId, name?, phone? } → send an autopilot follow-up text.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get('days')) || 3))
  const items = await findFollowUpLeads(agencyId, days)
  return NextResponse.json({ ok: true, days, items })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const kind = body.kind === 'seller' ? 'seller' : 'buyer'
  const leadId = String(body.leadId || '')
  if (!leadId) return NextResponse.json({ ok: false, error: 'leadId required' }, { status: 400 })

  const result = await sendFollowUpText(
    agencyId,
    {
      kind,
      lead_id: leadId,
      name: typeof body.name === 'string' ? body.name : null,
      phone: typeof body.phone === 'string' && body.phone ? body.phone : null,
    },
    { profileId: auth.user?.id || null },
  )
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || 'Follow-up failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, texted: true })
}
