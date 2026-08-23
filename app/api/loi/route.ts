import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { buildLoiContent, saveLoi, listLois, notifyLoiGenerated } from '@/lib/loi'

export const runtime = 'nodejs'

/**
 * POST /api/loi — generate an LOI from an accepted offer.
 *   body: { offerId }
 * GET /api/loi?agencyId=... — list generated LOIs for an agency.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (!body.offerId) return NextResponse.json({ ok: false, error: 'offerId is required' }, { status: 400 })

  const { data: offer } = await db
    .from('deal_offers')
    .select('agency_id, status')
    .eq('id', body.offerId)
    .maybeSingle()
  if (!offer) return NextResponse.json({ ok: false, error: 'Offer not found' }, { status: 404 })
  if (!auth.memberships.some((m) => m.agency_id === offer.agency_id)) {
    return NextResponse.json({ ok: false, error: 'Insufficient permission' }, { status: 403 })
  }
  if (offer.status !== 'accepted') {
    return NextResponse.json({ ok: false, error: 'Only accepted offers can generate an LOI' }, { status: 400 })
  }

  const built = await buildLoiContent(body.offerId)
  if (!built.ok || !built.content) {
    return NextResponse.json({ ok: false, error: built.error || 'Failed to build LOI' }, { status: 500 })
  }

  const saved = await saveLoi(built.content, offer.agency_id)
  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 500 })

  await notifyLoiGenerated(offer.agency_id, built.content.business_name)

  return NextResponse.json({ ok: true, loiId: saved.id, content: built.content })
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const lois = await listLois(agencyId)
  return NextResponse.json({ ok: true, lois })
}
