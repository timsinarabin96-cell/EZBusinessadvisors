/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { recommendOffer, compareColumns, offerHealth, type OfferRow } from '@/lib/offerCompareCore'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/offers/compare?listingId=... — side-by-side offer comparison.
// Returns ranked offers with health verdicts, the recommendation, and the
// table columns. Agency-scoped.
// =============================================================================

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId query param is required' }, { status: 400 })

  const { data: listing } = await db.from('listings').select('agency_id, asking_price').eq('id', listingId).maybeSingle()
  const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const { data: offers, error } = await db
    .from('deal_offers')
    .select('id, status, purchase_price, cash_at_closing, seller_note, earnout_amount, financing_contingency, diligence_days, training_days, closing_probability, seller_value_score, created_at, buyer_leads(full_name, company)')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const rows: OfferRow[] = (offers || []).map((o: any) => ({
    id: o.id,
    buyerName: o.buyer_leads?.full_name || o.buyer_leads?.company || null,
    purchasePrice: o.purchase_price,
    cashAtClosing: o.cash_at_closing,
    sellerNote: o.seller_note,
    earnout: o.earnout_amount,
    financingContingency: o.financing_contingency,
    diligenceDays: o.diligence_days,
    trainingDays: o.training_days,
    status: o.status,
    createdAt: o.created_at,
    closingProbability: o.closing_probability,
    sellerValueScore: o.seller_value_score,
  }))

  const askingPrice = (listing as { asking_price?: number | null }).asking_price ?? null
  const rec = recommendOffer(rows, askingPrice)
  const columns = compareColumns(rows, askingPrice)
  const withHealth = rows.map((r) => ({ ...r, health: offerHealth(r, askingPrice) }))

  return NextResponse.json({ ok: true, offers: withHealth, recommendation: rec, columns, askingPrice })
}
