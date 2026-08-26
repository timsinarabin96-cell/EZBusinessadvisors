import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * GET /api/buyer/matches
 * Returns the signed-in buyer's match events (from the AI match engine),
 * joined with listing details so the buyer dashboard can render them.
 * Optional ?status=pending|notified|dismissed|expired filter.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { data: buyerProfile } = await db
    .from('buyer_search_profiles')
    .select('id')
    .eq('profile_id', auth.user.id)
    .maybeSingle()

  if (!buyerProfile) {
    return NextResponse.json({ ok: true, matches: [] })
  }

  const status = String(req.nextUrl.searchParams.get('status') || '').trim()
  let query = db
    .from('buyer_match_events')
    .select('*, listings(id, business_name, industry, sub_industry, location_general, asking_price, annual_revenue, sde, status, cover_image_url)')
    .eq('buyer_profile_id', buyerProfile.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, matches: data || [] })
}
