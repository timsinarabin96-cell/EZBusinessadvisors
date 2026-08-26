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
// /api/admin/1099 — contractor management (platform admin only).
//   GET  ?year=2026          → contractors + YTD payment totals + $600 flags
//   POST                     → create or update a contractor (upsert by id)
//   DELETE ?id=              → delete a contractor (payments cascade)
// TINs are returned in full here (admin-only API + RLS) but masked in the UI.
// =============================================================================

const ENTITY_TYPES = ['individual', 'single_member_llc', 'multi_member_llc', 'partnership', 'corporation', 's_corp', 'other']
const TIN_TYPES = ['ein', 'ssn']
const W9_STATUSES = ['collected', 'pending', 'missing']

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  const [{ data: contractors, error: cErr }, { data: payments, error: pErr }] = await Promise.all([
    db.from('contractors').select('*').order('legal_name', { ascending: true }),
    db.from('contractor_payments').select('*').gte('payment_date', yearStart).lte('payment_date', yearEnd),
  ])
  if (cErr || pErr) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })

  // YTD totals + 1099 threshold flag per contractor
  const byContractor = new Map<string, { total: number; count: number; lastPaid: string | null }>()
  for (const p of payments || []) {
    const cur = byContractor.get(p.contractor_id) || { total: 0, count: 0, lastPaid: null }
    cur.total += Number(p.amount) || 0
    cur.count += 1
    if (!cur.lastPaid || p.payment_date > cur.lastPaid) cur.lastPaid = p.payment_date
    byContractor.set(p.contractor_id, cur)
  }

  const rows = (contractors || []).map((c) => {
    const agg = byContractor.get(c.id) || { total: 0, count: 0, lastPaid: null }
    return {
      ...c,
      ytd_total: Math.round(agg.total * 100) / 100,
      payment_count: agg.count,
      last_paid: agg.lastPaid,
      needs_1099: agg.total >= 600, // IRS filing threshold
    }
  })

  return NextResponse.json({ ok: true, year, contractors: rows })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const legalName = String(body.legal_name || '').trim()
  if (!legalName) return NextResponse.json({ ok: false, error: 'legal_name is required' }, { status: 400 })

  const payload: Record<string, unknown> = {
    legal_name: legalName,
    dba_name: String(body.dba_name || '').trim() || null,
    entity_type: ENTITY_TYPES.includes(String(body.entity_type)) ? String(body.entity_type) : 'individual',
    tin_type: TIN_TYPES.includes(String(body.tin_type)) ? String(body.tin_type) : 'ssn',
    tin: String(body.tin || '').trim() || null,
    address: String(body.address || '').trim() || null,
    city: String(body.city || '').trim() || null,
    state: String(body.state || '').trim() || null,
    zip: String(body.zip || '').trim() || null,
    w9_status: W9_STATUSES.includes(String(body.w9_status)) ? String(body.w9_status) : 'missing',
    w9_file_path: String(body.w9_file_path || '').trim() || null,
    start_date: String(body.start_date || '').trim() || null,
    active: body.active !== false,
    notes: String(body.notes || '').trim() || null,
    profile_id: String(body.profile_id || '').trim() || null,
    agency_id: String(body.agency_id || '').trim() || null,
  }

  let q = db.from('contractors').insert(payload).select().single()
  if (body.id) q = db.from('contractors').update(payload).eq('id', String(body.id)).select().single()
  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, contractor: data })
}

export async function DELETE(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const { error } = await db.from('contractors').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
