import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * GET /api/hiring/applications — broker/admin lists agent applications.
 * (Moved out of app/api/hiring/route.ts where Next.js never routed this path.)
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = authenticated.memberships[0]?.agency_id
  let q = db.from('agent_applications').select('*, hiring_packages(name, commission_split, role)')
  if (agencyId) q = q.eq('agency_id', agencyId)
  const { data, error } = await q.order('submitted_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, applications: data || [] })
}
