import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { draftCounterOffer, listNegotiationDrafts } from '@/lib/negotiation'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f-]{36}$/i

/**
 * /api/intelligence/negotiation
 *
 * GET  ?agencyId=...        — list negotiation drafts for an agency
 * POST { offerId, instructions? } — generate counter-offer variants for an
 *      Offer Lab offer (upserts one draft per offer)
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || ''
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const drafts = await listNegotiationDrafts(agencyId)
  return NextResponse.json({ ok: true, drafts })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = (await req.json().catch(() => null)) as { offerId?: string; instructions?: string } | null
  const offerId = body?.offerId || ''
  if (!offerId || !UUID_RE.test(offerId)) {
    return NextResponse.json({ ok: false, error: 'A valid offerId is required' }, { status: 400 })
  }

  // Verify the caller manages the agency that owns the offer.
  const { data: offer } = await db.from('deal_offers').select('agency_id').eq('id', offerId).maybeSingle()
  if (!offer) return NextResponse.json({ ok: false, error: 'Offer not found' }, { status: 404 })
  if (!canManageAgency(authenticated, offer.agency_id)) return forbiddenResponse()

  const result = await draftCounterOffer(offerId, typeof body?.instructions === 'string' ? body.instructions : undefined)
  if (!result.ok || !result.draft) {
    return NextResponse.json({ ok: false, error: result.error || 'Generation failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, draft: result.draft })
}
