import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { logCommunication, listCommunications } from '@/lib/communications'

export const runtime = 'nodejs'

/**
 * GET  /api/communications?agencyId=...&listingId=&buyerLeadId=&sellerLeadId=&dealId=
 * POST /api/communications { listing_id?|buyer_lead_id?|seller_lead_id?|deal_id?,
 *        channel, direction, outcome, contact_name?, summary?, duration_seconds?, auto_reschedule? }
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const comms = await listCommunications(agencyId, {
    listingId: req.nextUrl.searchParams.get('listingId') || undefined,
    buyerLeadId: req.nextUrl.searchParams.get('buyerLeadId') || undefined,
    sellerLeadId: req.nextUrl.searchParams.get('sellerLeadId') || undefined,
    dealId: req.nextUrl.searchParams.get('dealId') || undefined,
  })
  return NextResponse.json({ ok: true, communications: comms })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  if (!['call', 'email', 'sms', 'meeting', 'other'].includes(body.channel || '')) {
    return NextResponse.json({ ok: false, error: 'channel must be call|email|sms|meeting|other' }, { status: 400 })
  }
  if (!['outbound', 'inbound'].includes(body.direction || '')) {
    return NextResponse.json({ ok: false, error: 'direction must be outbound|inbound' }, { status: 400 })
  }

  const result = await logCommunication({
    agency_id: agencyId,
    profile_id: auth.user.id,
    listing_id: body.listing_id || null,
    buyer_lead_id: body.buyer_lead_id || null,
    seller_lead_id: body.seller_lead_id || null,
    deal_id: body.deal_id || null,
    channel: body.channel,
    direction: body.direction,
    outcome: body.outcome || 'other',
    contact_name: body.contact_name || null,
    summary: body.summary || null,
    duration_seconds: body.duration_seconds || null,
    auto_reschedule: !!body.auto_reschedule,
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, communication: result.comm, reminder: result.reminder || null })
}
