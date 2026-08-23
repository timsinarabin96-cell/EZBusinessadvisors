import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/** GET /api/listings/options?agencyId=... — listing picker options for the offer lab. */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || ''
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const { data, error } = await db
    .from('listings')
    .select('id, business_name, asking_price')
    .eq('agency_id', agencyId)
    .in('status', ['approved', 'active', 'pending', 'draft'])
    .order('business_name', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const listings = (data || []).map((l: any) => ({
    id: l.id,
    label: `${l.business_name}${l.asking_price ? ` — $${Number(l.asking_price).toLocaleString()}` : ''}`,
  }))
  return NextResponse.json({ ok: true, listings })
}
