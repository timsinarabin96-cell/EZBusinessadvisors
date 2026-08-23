import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

const SELECT = `
  id, listing_id, from_agency_id, to_agency_id, to_profile_id, split_pct, status,
  note, responded_at, created_at,
  listing:listings(id, business_name, listing_ref, asking_price, industry, location_general),
  from_agency:agencies!syndication_offers_from_agency_id_fkey(name),
  to_agency:agencies!syndication_offers_to_agency_id_fkey(name)
`

/**
 * GET /api/syndication?view=inbox|outbox — my agency's offers.
 * GET /api/syndication?stats=1 — incoming/outgoing/accepted counts.
 * POST /api/syndication — offer a listing to a broker.
 * PATCH /api/syndication?id=&action=accept|decline|withdraw — respond.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = auth.memberships[0]?.agency_id
  if (!agencyId) return forbiddenResponse('Not attached to an agency')

  if (req.nextUrl.searchParams.get('stats') === '1') {
    const { data } = await db.from('syndication_offers').select('id, status, from_agency_id, to_agency_id')
    const rows = data || []
    return NextResponse.json({
      ok: true,
      stats: {
        incoming: rows.filter((r) => r.to_agency_id === agencyId && r.status === 'offered').length,
        outgoing: rows.filter((r) => r.from_agency_id === agencyId && r.status === 'offered').length,
        accepted: rows.filter((r) => r.status === 'accepted' && (r.from_agency_id === agencyId || r.to_agency_id === agencyId)).length,
      },
    })
  }

  const view = req.nextUrl.searchParams.get('view') || 'inbox'
  let q = db.from('syndication_offers').select(SELECT)
  if (view === 'inbox') {
    q = q.eq('to_agency_id', agencyId).in('status', ['offered', 'accepted'])
  } else {
    q = q.eq('from_agency_id', agencyId)
  }
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, offers: data })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = auth.memberships[0]?.agency_id
  if (!agencyId) return forbiddenResponse('Not attached to an agency')

  const body = await req.json().catch(() => null)
  if (!body?.listingId || !body?.toProfileId) {
    return NextResponse.json({ ok: false, error: 'listingId and toProfileId are required' }, { status: 400 })
  }
  const split = Number(body.splitPct)
  if (!Number.isFinite(split) || split < 0 || split > 100) {
    return NextResponse.json({ ok: false, error: 'splitPct must be 0–100' }, { status: 400 })
  }

  const { data: broker } = await db
    .from('broker_profiles')
    .select('profile_id, agency_id, public_name')
    .eq('profile_id', body.toProfileId)
    .maybeSingle()
  if (!broker?.agency_id) return NextResponse.json({ ok: false, error: 'Broker not found or not attached to an agency' }, { status: 404 })
  if (broker.agency_id === agencyId) return NextResponse.json({ ok: false, error: 'Cannot syndicate to your own agency' }, { status: 400 })

  const { data: listing } = await db
    .from('listings')
    .select('id, agency_id, business_name')
    .eq('id', body.listingId)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found in your agency' }, { status: 404 })

  const { data, error } = await db
    .from('syndication_offers')
    .insert({
      listing_id: body.listingId,
      from_agency_id: agencyId,
      to_agency_id: broker.agency_id,
      to_profile_id: body.toProfileId,
      split_pct: split,
      note: body.note || null,
      status: 'offered',
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = auth.memberships[0]?.agency_id
  if (!agencyId) return forbiddenResponse('Not attached to an agency')

  const id = req.nextUrl.searchParams.get('id')
  const action = req.nextUrl.searchParams.get('action')
  if (!id || !['accept', 'decline', 'withdraw'].includes(action || '')) {
    return NextResponse.json({ ok: false, error: 'id and action (accept|decline|withdraw) required' }, { status: 400 })
  }

  const status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn'
  let q = db.from('syndication_offers').update({ status, responded_at: new Date().toISOString() }).eq('id', id).eq('status', 'offered')
  q = action === 'withdraw' ? q.eq('from_agency_id', agencyId) : q.eq('to_agency_id', agencyId)

  const { data: updated, error } = await q.select('id').maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ ok: false, error: 'Offer not found or already responded to' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
