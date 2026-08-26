import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * GET /api/training/analytics
 * Agency-owner view of the training program. Returns:
 *   - leaderboard: brokers in the caller's agency ranked by XP
 *   - stuck: brokers with low completion (below half the modules)
 *   - teamStats: aggregate XP / certs / programCertified
 * No client-visible PII beyond what the agency already sees.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const { data: members } = await db
    .from('agency_members')
    .select('profile_id')
    .eq('agency_id', agencyId)

  const profileIds = (members || []).map((m: any) => m.profile_id)
  if (profileIds.length === 0) {
    return NextResponse.json({ ok: true, leaderboard: [], stuck: [], teamStats: { brokers: 0, totalXp: 0, modulesCertified: 0, programCertified: 0 } })
  }

  const { data: g } = await db
    .from('training_gamification')
    .select('broker_id, xp, current_streak, modules_certified, program_certified')
    .in('broker_id', profileIds)

  const { data: profiles } = await db
    .from('profiles')
    .select('id, full_name, email')
    .in('id', profileIds)

  const nameBy = new Map((profiles || []).map((p: any) => [p.id, p.full_name || (p.email || '').split('@')[0]]))

  const rows = (g || []).map((row: any) => ({
    profileId: row.broker_id,
    name: nameBy.get(row.broker_id) || 'Broker',
    xp: row.xp || 0,
    streak: row.current_streak || 0,
    modulesCertified: row.modules_certified || 0,
    programCertified: !!row.program_certified,
  }))

  const leaderboard = [...rows].sort((a, b) => b.xp - a.xp)
  const stuck = rows
    .filter((r) => r.modulesCertified < 5 && r.xp < 300)
    .sort((a, b) => a.xp - b.xp)

  const teamStats = {
    brokers: profileIds.length,
    totalXp: rows.reduce((s, r) => s + r.xp, 0),
    modulesCertified: rows.reduce((s, r) => s + r.modulesCertified, 0),
    programCertified: rows.filter((r) => r.programCertified).length,
  }

  return NextResponse.json({ ok: true, leaderboard, stuck, teamStats })
}
