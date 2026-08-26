/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createOffer, fetchOffers, updateOfferStatus } from '@/lib/offers'

export const runtime = 'nodejs'

const offerSchema = z.object({
  listing_id: z.string().uuid(),
  buyer_lead_id: z.string().uuid().optional().nullable(),
  deal_id: z.string().uuid().optional().nullable(),
  purchase_price: z.number().nonnegative().nullable().optional(),
  cash_at_closing: z.number().nonnegative().nullable().optional(),
  seller_note: z.number().nonnegative().nullable().optional(),
  earnout_amount: z.number().nonnegative().nullable().optional(),
  financing_contingency: z.boolean().optional(),
  diligence_days: z.number().int().nonnegative().nullable().optional(),
  training_days: z.number().int().nonnegative().nullable().optional(),
  terms: z.record(z.string(), z.unknown()).optional(),
})

const statusSchema = z.object({
  offerId: z.string().uuid(),
  status: z.enum(['draft', 'submitted', 'accepted', 'rejected', 'withdrawn']),
})

/**
 * POST /api/offers — create a draft offer in the lab.
 * PATCH /api/offers — change offer status (submit/accept/reject/withdraw).
 * GET  /api/offers?agencyId=... — list offers for an agency.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const parsed = offerSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed', detail: parsed.error.issues[0]?.message }, { status: 422 })
  }

  const result = await createOffer(parsed.data)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, offer: result.offer })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const parsed = statusSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed', detail: parsed.error.issues[0]?.message }, { status: 422 })
  }
  const { offerId, status } = parsed.data

  const { data: offer } = await db.from('deal_offers').select('agency_id').eq('id', offerId).maybeSingle()
  if (!offer) return NextResponse.json({ ok: false, error: 'Offer not found' }, { status: 404 })
  if (!canManageAgency(authenticated, offer.agency_id)) return forbiddenResponse()

  const result = await updateOfferStatus(offer.agency_id, offerId, status)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || ''
  const listingId = req.nextUrl.searchParams.get('listingId') || undefined
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const offers = await fetchOffers(agencyId, listingId)
  return NextResponse.json({ ok: true, offers })
}
