import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { getListingReadiness } from '@/lib/publish'

export const runtime = 'nodejs'

/**
 * GET /api/listings/readiness?listingId=...
 * Pre-publish quality gate: returns the readiness score, label, and the list
 * of missing fields. Publish is blocked below 70.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })

  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, listing.agency_id)) return forbiddenResponse()

  const res = await getListingReadiness(listingId)
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
  return NextResponse.json({ ok: true, score: res.score, label: res.label, missing: res.missing })
}
