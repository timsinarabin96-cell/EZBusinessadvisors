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
// /api/admin/api-keys — admin-only API key registry.
//   GET             → all registry rows (masked tails only — never full keys)
//   POST            → upsert a row (key_name, provider, website_url, purpose,
//                     status, masked_tail, notes)
//   DELETE ?id=     → remove a row
// Platform admin only + RLS at the DB layer.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data, error } = await db
    .from('api_keys_registry')
    .select('*')
    .order('provider', { ascending: true })
    .order('key_name', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
  return NextResponse.json({ ok: true, keys: data || [] })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const keyName = String(body.key_name || '').trim().toUpperCase()
  const provider = String(body.provider || '').trim()
  if (!keyName || !provider) {
    return NextResponse.json({ ok: false, error: 'key_name and provider are required' }, { status: 400 })
  }

  const payload = {
    key_name: keyName,
    provider,
    website_url: String(body.website_url || '').trim() || null,
    purpose: String(body.purpose || '').trim() || null,
    status: ['configured', 'missing', 'revoked'].includes(String(body.status)) ? String(body.status) : 'configured',
    masked_tail: String(body.masked_tail || '').trim() || null,
    notes: String(body.notes || '').trim() || null,
  }

  const { data, error } = await db
    .from('api_keys_registry')
    .upsert(payload, { onConflict: 'key_name' })
    .select()
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, key: data })
}

export async function DELETE(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const { error } = await db.from('api_keys_registry').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
