import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * GET /api/listings/options?agencyId=... — listing picker options.
 *
 * Every listing selector in the app (Offer Lab, Valuation, Expiry, Closing,
 * Deal Twin, Sellable Reports, Readiness) reads from here so options are
 * ALWAYS in sync with the real listings.
 *
 * Resolution order:
 *  1. agencyId param (when the caller passes one)
 *  2. caller's primary membership (owner/admin first) — so callers that
 *     forget the param still get a working dropdown instead of a 403
 *  3. platform super_admins see ALL agencies' listings (they own the demo)
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  let agencyId = req.nextUrl.searchParams.get('agencyId') || ''
  const isSuperAdmin = authenticated.profile?.role === 'super_admin'

  // Fall back to the caller's primary membership when no agencyId is passed
  // (fixes Offer Lab and any future selector that forgets the param).
  if (!agencyId) {
    const memberships = authenticated.memberships || []
    const primary = [...memberships].sort((a, b) => Number(b.is_owner || false) - Number(a.is_owner || false))[0]
    agencyId = primary?.agency_id || ''
    if (!agencyId) return forbiddenResponse()
  } else if (!isSuperAdmin && !canManageAgency(authenticated, agencyId)) {
    return forbiddenResponse()
  }

  // Super-admins see every agency's listings — the demo/owner experience.
  let query = db
    .from('listings')
    .select('id, business_name, asking_price, agency_id')
    .in('status', ['approved', 'active', 'pending', 'draft'])
    .order('business_name', { ascending: true })
    .limit(400)

  if (!isSuperAdmin) query = query.eq('agency_id', agencyId)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const listings = (data || []).map((l: any) => ({
    id: l.id,
    label: `${l.business_name}${l.asking_price ? ` — $${Number(l.asking_price).toLocaleString()}` : ''}`,
  }))
  return NextResponse.json({ ok: true, listings })
}
