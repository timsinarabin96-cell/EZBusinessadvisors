import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { requestNdaAccess, listNdaRequests } from '@/lib/ndaAccess'

export const runtime = 'nodejs'

/**
 * POST /api/data-rooms/access-request — public: buyer signs NDA and requests
 *   confidential access to a listing's data room.
 *   body: { listing_id, data_room_id?, requester_name, requester_email,
 *           requester_company?, rationale?, nda_signature }
 * GET /api/data-rooms/access-request?agencyId=...&status=... — broker view.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null

  const result = await requestNdaAccess({
    listing_id: body.listing_id,
    data_room_id: body.data_room_id || null,
    requester_name: body.requester_name,
    requester_email: body.requester_email,
    requester_company: body.requester_company || null,
    rationale: body.rationale || null,
    nda_signature: body.nda_signature,
    ip_address: ip,
  })

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, requestId: result.requestId })
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const status = req.nextUrl.searchParams.get('status') || 'all'
  const requests = await listNdaRequests(agencyId, status)
  return NextResponse.json({ ok: true, requests })
}
