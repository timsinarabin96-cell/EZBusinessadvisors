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
// /api/admin/escrow — success-fee escrow workflow (platform admin only).
//   GET                 → escrow accounts joined with deals/listings/closing
//   POST                → create an escrow account (or update status)
//   POST {action:'release'} → release escrow AND record the success fee into
//                         contractor_payments (feeds the 1099 module)
// =============================================================================

const STATUSES = ['pending', 'funded', 'released', 'refunded']

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  // Escrow accounts + listing/deal refs in one query, then closing details
  // separately (PostgREST cannot embed deal_closing_details — no FK declared)
  // and merge in code.
  const { data, error } = await db
    .from('deal_escrow_accounts')
    .select('*, listings(business_name), deals(id)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })

  const listingIds = [...new Set((data || []).map((e) => e.listing_id).filter(Boolean))]
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

  const rows = (data || []).map((e) => {
    const close = closingByListing[e.listing_id]
    return {
      ...e,
      final_purchase_price: close?.final_purchase_price ?? null,
      closing_date: close?.closing_date ?? null,
    }
  })
  return NextResponse.json({ ok: true, escrow: rows })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const action = String(body.action || 'create')

  // --- Create / update escrow account ---------------------------------------
  if (action === 'create' || action === 'update') {
    const id = String(body.id || '').trim()
    const listingId = String(body.listing_id || '').trim()
    const agencyId = String(body.agency_id || '').trim()
    if (!id && (!listingId || !agencyId)) {
      return NextResponse.json({ ok: false, error: 'listing_id and agency_id are required to create' }, { status: 400 })
    }
    const payload: Record<string, unknown> = {
      escrow_company: String(body.escrow_company || '').trim() || null,
      account_ref: String(body.account_ref || '').trim() || null,
      amount: body.amount != null && !isNaN(Number(body.amount)) ? Number(body.amount) : null,
      deal_id: String(body.deal_id || '').trim() || null,
      notes: String(body.notes || '').trim() || null,
    }
    if (STATUSES.includes(String(body.status))) {
      payload.status = String(body.status)
      const now = new Date().toISOString()
      if (String(body.status) === 'funded') payload.funded_at = body.funded_at || now
      if (String(body.status) === 'released') payload.released_at = body.released_at || now
    }
    let q
    if (id) q = db.from('deal_escrow_accounts').update(payload).eq('id', id).select().single()
    else q = db.from('deal_escrow_accounts').insert({ listing_id: listingId, agency_id: agencyId, ...payload }).select().single()
    const { data, error } = await q
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, escrow: data })
  }

  // --- Release escrow + record success fee into contractor_payments ---------
  if (action === 'release') {
    const id = String(body.id || '').trim()
    const contractorId = String(body.contractor_id || '').trim()
    const feeAmount = Number(body.fee_amount)
    if (!id || !contractorId || !feeAmount || isNaN(feeAmount) || feeAmount <= 0) {
      return NextResponse.json({ ok: false, error: 'id, contractor_id, and a positive fee_amount are required' }, { status: 400 })
    }
    const { data: escrow } = await db.from('deal_escrow_accounts').select('*').eq('id', id).maybeSingle()
    if (!escrow) return NextResponse.json({ ok: false, error: 'escrow account not found' }, { status: 404 })
    const { data: contractor } = await db.from('contractors').select('id, agency_id').eq('id', contractorId).maybeSingle()
    if (!contractor) return NextResponse.json({ ok: false, error: 'contractor not found' }, { status: 404 })

    // 1) Mark escrow released.
    await db.from('deal_escrow_accounts').update({
      status: 'released',
      released_at: new Date().toISOString(),
      notes: (escrow.notes ? escrow.notes + ' · ' : '') + 'Success fee released',
    }).eq('id', id)

    // 2) Record the success fee as a contractor payment (feeds 1099 YTD).
    const { data: payment, error: pErr } = await db.from('contractor_payments').insert({
      contractor_id: contractorId,
      agency_id: contractor.agency_id || escrow.agency_id || null,
      amount: Math.round(feeAmount * 100) / 100,
      payment_date: String(body.payment_date || new Date().toISOString().slice(0, 10)),
      method: String(body.method || 'ach'),
      reference: String(body.reference || '').trim() || `Escrow release · ${escrow.account_ref || escrow.id}`,
      category: 'commission',
      deal_id: escrow.deal_id || null,
      notes: `Success fee from escrow on ${escrow.listing_id || 'deal'}`,
    }).select().single()
    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, payment, escrow: { ...escrow, status: 'released' } })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}
