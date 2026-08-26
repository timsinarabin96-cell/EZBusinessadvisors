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
// /api/admin/ads — admin-only sponsored slot management.
//   GET             → all slots (including inactive/expired — admin view)
//   POST            → upsert a slot
//   DELETE ?id=     → remove a slot
// Platform admin only + RLS at the DB layer.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data, error } = await db
    .from('ad_slots')
    .select('*')
    .order('active', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
  return NextResponse.json({ ok: true, slots: data || [] })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const slotKey = String(body.slot_key || '').trim().toLowerCase()
  const advertiser = String(body.advertiser || '').trim()
  if (!slotKey || !advertiser || !String(body.body || '').trim() || !String(body.url || '').trim()) {
    return NextResponse.json({ ok: false, error: 'slot_key, advertiser, body, and url are required' }, { status: 400 })
  }

  const payload = {
    slot_key: slotKey,
    advertiser,
    body: String(body.body).trim(),
    url: String(body.url).trim(),
    badge: String(body.badge || 'Sponsored').trim(),
    starts_at: String(body.starts_at || new Date().toISOString().slice(0, 10)),
    ends_at: String(body.ends_at || '').trim() || null,
    active: body.active !== false,
    monthly_fee_cents: Math.max(0, Number(body.monthly_fee_cents) || 0),
    notes: String(body.notes || '').trim() || null,
  }

  const { data, error } = await db.from('ad_slots').upsert(payload, { onConflict: 'slot_key' }).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, slot: data })
}

export async function DELETE(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const { error } = await db.from('ad_slots').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
