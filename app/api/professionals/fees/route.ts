/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * /api/professionals/fees — per-deal referral fees owed to the platform.
 *   GET  ?agencyId=            → ledger: professional, deal, amount, status
 *   POST { professionalId, dealId?, listingId?, basisAmount?, feePct?, notes? }
 *                              → record a referral fee (amount = basis × pct)
 *   PATCH { id, status, invoiceRef?, paidMethod? } → due → invoiced → paid
 * Owner/admin only (billing confidentiality). Requires the
 * professional_referral_fees schema (sql/professional_referral_fees.sql).
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId')
  if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId required' }, { status: 400 })
  if (!canManageAgency(auth, agencyId)) return forbidden()

  const { data, error } = await db
    .from('professional_referral_fees')
    .select('*, deal_professionals(name, professional_type, firm)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, fees: data })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const professionalId = String(body.professionalId || '')
  const agencyId = String(body.agencyId || auth.memberships[0]?.agency_id || '')
  if (!professionalId || !agencyId) return NextResponse.json({ ok: false, error: 'professionalId + agencyId required' }, { status: 400 })
  if (!canManageAgency(auth, agencyId)) return forbidden()

  // The professional must have agreed to pay referral fees.
  const { data: pro } = await db.from('deal_professionals').select('pays_referral_fees, referral_fee_pct, name').eq('id', professionalId).maybeSingle()
  if (!pro) return NextResponse.json({ ok: false, error: 'Professional not found' }, { status: 404 })
  if (!pro.pays_referral_fees) {
    return NextResponse.json({ ok: false, error: `${pro.name} has no referral-fee agreement — cannot record a fee.` }, { status: 422 })
  }

  const basis = Number(body.basisAmount) || 0
  const feePct = Number(body.feePct) || Number(pro.referral_fee_pct) || 0
  if (basis <= 0 || feePct <= 0) {
    return NextResponse.json({ ok: false, error: 'basisAmount and feePct (or the professional default) are required' }, { status: 400 })
  }
  const amount = Math.round(basis * (feePct / 100) * 100) / 100

  const { data, error } = await db.from('professional_referral_fees').insert({
    agency_id: agencyId,
    professional_id: professionalId,
    deal_id: body.dealId || null,
    listing_id: body.listingId || null,
    basis_amount: basis,
    fee_pct: feePct,
    amount,
    status: 'due',
    notes: body.notes || null,
    created_by: auth.user.id,
  }).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, fee: data })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const { data: existing } = await db.from('professional_referral_fees').select('agency_id').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'Fee record not found' }, { status: 404 })
  if (!canManageAgency(auth, existing.agency_id)) return forbidden()

  const patch: Record<string, unknown> = {}
  if (body.status) {
    const status = String(body.status)
    if (!['due', 'invoiced', 'paid', 'waived'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'status must be due | invoiced | paid | waived' }, { status: 400 })
    }
    patch.status = status
    patch.paid_at = status === 'paid' ? new Date().toISOString() : null
  }
  if (body.invoiceRef) patch.invoice_ref = String(body.invoiceRef)
  if (body.paidMethod) patch.paid_method = String(body.paidMethod)

  const { error } = await db.from('professional_referral_fees').update(patch).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

function forbidden() {
  return NextResponse.json({ ok: false, error: 'Insufficient permission' }, { status: 403 })
}
