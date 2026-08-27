/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/buyers/portal — logged-in buyer sees THEIR deals.
// -----------------------------------------------------------------------------
// Real buyer logins: a buyer account (persona=buyer) is matched by email to
// their buyer_lists rows across agencies. Returns each deal's listing info,
// pipeline stage, NDA/qualification status, and offers count. No identity
// leak — only rows matching the logged-in user's email.
// =============================================================================

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return unauthorizedResponse()
  const { data: auth, error: authErr } = await db.auth.getUser(token)
  if (authErr || !auth?.user) return unauthorizedResponse()

  const email = auth.user.email?.toLowerCase()
  if (!email) return NextResponse.json({ ok: false, error: 'No email on this account' }, { status: 400 })

  // Buyer-lead rows linked to this email (agency-scoped read via RLS).
  const { data: leads } = await db
    .from('buyer_leads')
    .select('id, agency_id, contact_name, company, verified_buyer')
    .ilike('email', email)

  const leadIds = (leads || []).map((l: any) => l.id)

  // Pipeline rows matching this buyer across every agency.
  const { data: lists } = await db
    .from('buyer_lists')
    .select('*, listings(id, business_name, industry, location_general, asking_price, status, public_title, image_urls)')
    .ilike('buyer_email', email)

  // Offers tied to the buyer's lead rows (count per listing).
  let offerCounts: Record<string, number> = {}
  if (leadIds.length > 0) {
    const { data: offers } = await db.from('deal_offers').select('listing_id, buyer_lead_id, purchase_price, status').in('buyer_lead_id', leadIds)
    for (const o of (offers || []) as any[]) {
      const key = o.listing_id
      offerCounts[key] = (offerCounts[key] || 0) + 1
    }
  }

  const deals = ((lists || []) as any[]).map((b) => {
    const listing = b.listings || {}
    return {
      buyerListId: b.id,
      pipeline_stage: b.pipeline_stage,
      stage_entered_at: b.stage_entered_at,
      heat_score: b.heat_score,
      nda_signed: !!b.nda_signed,
      financial_qualified: !!b.financial_qualified,
      is_primary_buyer: !!b.is_primary_buyer,
      listing: {
        id: listing.id,
        business_name: listing.business_name,
        public_title: listing.public_title,
        industry: listing.industry,
        location_general: listing.location_general,
        asking_price: listing.asking_price,
        status: listing.status,
        image_urls: Array.isArray(listing.image_urls) ? listing.image_urls : [],
      },
      offers_count: b.listing_id ? offerCounts[b.listing_id] || 0 : 0,
    }
  })

  return NextResponse.json({
    ok: true,
    buyer: { name: (leads as any[])?.[0]?.contact_name || auth.user.user_metadata?.full_name || null, verified_buyer: (leads as any[])?.[0]?.verified_buyer || false },
    deals,
  })
}
