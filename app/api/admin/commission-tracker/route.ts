/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'

export const runtime = 'nodejs'

// =============================================================================
// /api/admin/commission-tracker — success-fee tracking at closing (admin).
//   GET  → closed deals with commission info + computed success fee
//   POST → record a payment to a contractor (creates contractor_payment → 1099)
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  // Commissions joined with listing + closing details for success-fee math.
  // NOTE: PostgREST cannot embed deal_closing_details here (no FK declared), so
  // we fetch commissions + listings + profiles in one query, then pull closing
  // details separately and merge in code.
  const { data: commissions, error } = await db
    .from('deal_commissions')
    .select('*, listings(business_name), profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })

  // Closing details keyed by listing_id (closing date + final price).
  const listingIds = [...new Set((commissions || []).map((c) => c.listing_id).filter(Boolean))]
  let closingByListing: Record<string, { final_purchase_price: number | null; closing_date: string | null }> = {}
  if (listingIds.length > 0) {
    const { data: closing, error: cerr } = await db
      .from('deal_closing_details')
      .select('listing_id, final_purchase_price, closing_date')
      .in('listing_id', listingIds)
    if (!cerr) {
      for (const row of closing || []) {
        closingByListing[row.listing_id] = {
          final_purchase_price: row.final_purchase_price != null ? Number(row.final_purchase_price) : null,
          closing_date: row.closing_date || null,
        }
      }
    }
  }

  const rows = (commissions || []).map((c) => {
    const close = closingByListing[c.listing_id]
    const price = Number(close?.final_purchase_price) || 0
    const pct = Number(c.commission_percentage) || 0
    const amount = Number(c.commission_amount) || 0
    const computed = amount > 0 ? amount : (price * pct) / 100
    return {
      id: c.id,
      listing_id: c.listing_id,
      deal_id: c.deal_id,
      agent_id: c.agent_id,
      agent_name: c.profiles?.full_name || null,
      business_name: c.listings?.business_name || null,
      final_purchase_price: price,
      commission_percentage: pct,
      commission_amount: amount,
      success_fee: Math.round(computed * 100) / 100,
      paid_status: c.paid_status,
      paid_at: c.paid_at,
      closing_date: close?.closing_date || null,
      created_at: c.created_at,
    }
  })

  return NextResponse.json({ ok: true, commissions: rows })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const commissionId = String(body.commission_id || '').trim()
  const contractorId = String(body.contractor_id || '').trim()
  const amount = Number(body.amount)
  if (!commissionId || !contractorId || !amount || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: 'commission_id, contractor_id, and a positive amount are required' }, { status: 400 })
  }

  const [commissionRes, contractorRes] = await Promise.all([
    db.from('deal_commissions').select('deal_id, listing_id, agent_id').eq('id', commissionId).maybeSingle(),
    db.from('contractors').select('id, agency_id').eq('id', contractorId).maybeSingle(),
  ])
  if (!commissionRes.data || !contractorRes.data) {
    return NextResponse.json({ ok: false, error: 'commission or contractor not found' }, { status: 404 })
  }

  // 1) Create the contractor payment (feeds the 1099 module).
  const { data: payment, error: pErr } = await db.from('contractor_payments').insert({
    contractor_id: contractorId,
    agency_id: contractorRes.data.agency_id || null,
    amount: Math.round(amount * 100) / 100,
    payment_date: String(body.payment_date || new Date().toISOString().slice(0, 10)),
    method: String(body.method || 'ach'),
    reference: String(body.reference || '').trim() || null,
    category: 'commission',
    deal_id: commissionRes.data.deal_id || null,
    notes: String(body.notes || '').trim() || `Success fee on ${commissionRes.data.listing_id || 'deal'}`,
  }).select().single()
  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 })

  // 2) Mark the commission paid.
  await db.from('deal_commissions').update({ paid_status: 'paid', paid_at: new Date().toISOString() }).eq('id', commissionId)

  return NextResponse.json({ ok: true, payment })
}
