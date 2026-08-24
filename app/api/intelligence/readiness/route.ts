import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { computeReadiness, fetchReadinessFunnel, buildBlockingSummary } from '@/lib/sellerReadiness'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f-]{36}$/i

/**
 * /api/intelligence/readiness
 *
 * GET  ?listingId=...                        — latest snapshot for a listing
 * GET  ?agencyId=...&action=funnel           — agency-wide readiness-to-close funnel
 * GET  ?listingId=...&action=blocking        — "what's blocking" plain-language summary
 * POST { listingId }                         — (re)compute and persist the snapshot
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  // Agency-wide funnel
  if (req.nextUrl.searchParams.get('action') === 'funnel') {
    const agencyId = req.nextUrl.searchParams.get('agencyId') || authenticated.memberships[0]?.agency_id
    if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()
    const result = await fetchReadinessFunnel(agencyId)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, funnel: result.funnel })
  }

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  if (!listingId || !UUID_RE.test(listingId)) {
    return NextResponse.json({ ok: false, error: 'A valid listingId is required' }, { status: 400 })
  }

  const { data: listing, error: listingError } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  if (listingError) return NextResponse.json({ ok: false, error: listingError.message }, { status: 500 })
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(authenticated, listing.agency_id)) return forbiddenResponse()

  const { data, error } = await db.from('seller_readiness').select('*').eq('listing_id', listingId).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: true, snapshot: null })

  // "What's blocking" summary
  if (req.nextUrl.searchParams.get('action') === 'blocking') {
    const summary = await buildBlockingSummary(data as never)
    return NextResponse.json({ ok: true, summary })
  }

  return NextResponse.json({ ok: true, snapshot: data })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = (await req.json().catch(() => null)) as { listingId?: string } | null
  const listingId = body?.listingId || ''
  if (!listingId || !UUID_RE.test(listingId)) {
    return NextResponse.json({ ok: false, error: 'A valid listingId is required' }, { status: 400 })
  }

  const { data: listing, error: listingError } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  if (listingError) return NextResponse.json({ ok: false, error: listingError.message }, { status: 500 })
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(authenticated, listing.agency_id)) return forbiddenResponse()

  const result = await computeReadiness(listingId)
  if (!result.ok || !result.snapshot) {
    return NextResponse.json({ ok: false, error: result.error || 'Readiness computation failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, snapshot: result.snapshot })
}
