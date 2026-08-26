import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { fetchBriefingData, composeBriefing } from '@/lib/aiBriefing'

export const runtime = 'nodejs'

/**
 * GET /api/calendar/briefing?agencyId=...
 * In-app "Today" briefing for the Deal Time view. Same engine as the 6am
 * email cron (fetchBriefingData + composeBriefing) but served to the browser,
 * so brokers see what matters today before they even open email.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const data = await fetchBriefingData(agencyId)
  const { headline } = composeBriefing(data)

  return NextResponse.json({
    ok: true,
    headline,
    counts: {
      overdue: data.overdue.length,
      dueToday: data.dueToday.length,
      deadlines72h: data.deadlines.length,
      appointmentsToday: data.appointmentsToday.length,
      coldDeals: data.coldDeals.length,
    },
    overdue: data.overdue.slice(0, 5),
    dueToday: data.dueToday.slice(0, 5),
    deadlines: data.deadlines.slice(0, 5),
    appointmentsToday: data.appointmentsToday.slice(0, 5),
    coldDeals: data.coldDeals.slice(0, 5),
  })
}
