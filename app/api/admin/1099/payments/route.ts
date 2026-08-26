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
// /api/admin/1099/payments — contractor payment ledger (platform admin only).
//   GET  ?contractorId=&year=  → payments for a contractor (year filter)
//   POST                       → record a payment to a contractor
//   DELETE ?id=                → remove a payment
// =============================================================================

const METHODS = ['ach', 'check', 'cash', 'stripe', 'paypal', 'other']
const CATEGORIES = ['commission', 'bonus', 'referral', 'retainer', 'other']

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const contractorId = req.nextUrl.searchParams.get('contractorId') || undefined
  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear()

  let q = db
    .from('contractor_payments')
    .select('*')
    .gte('payment_date', `${year}-01-01`)
    .lte('payment_date', `${year}-12-31`)
    .order('payment_date', { ascending: false })
  if (contractorId) q = q.eq('contractor_id', contractorId)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })

  const total = (data || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  return NextResponse.json({ ok: true, year, payments: data || [], total: Math.round(total * 100) / 100 })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const contractorId = String(body.contractor_id || '').trim()
  const amount = Number(body.amount)
  if (!contractorId || !amount || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: 'contractor_id and a positive amount are required' }, { status: 400 })
  }

  const { data: contractor } = await db.from('contractors').select('id').eq('id', contractorId).maybeSingle()
  if (!contractor) return NextResponse.json({ ok: false, error: 'contractor not found' }, { status: 404 })

  const payload = {
    contractor_id: contractorId,
    agency_id: String(body.agency_id || '').trim() || null,
    amount: Math.round(amount * 100) / 100,
    payment_date: String(body.payment_date || new Date().toISOString().slice(0, 10)),
    method: METHODS.includes(String(body.method)) ? String(body.method) : 'other',
    reference: String(body.reference || '').trim() || null,
    category: CATEGORIES.includes(String(body.category)) ? String(body.category) : 'commission',
    commission_record_id: String(body.commission_record_id || '').trim() || null,
    deal_id: String(body.deal_id || '').trim() || null,
    notes: String(body.notes || '').trim() || null,
  }

  const { data, error } = await db.from('contractor_payments').insert(payload).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, payment: data })
}

export async function DELETE(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const { error } = await db.from('contractor_payments').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
