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
// GET/POST /api/admin/brokers — platform-admin broker management.
//   GET  ?agencyId=… — brokers of an agency (with featured flag + strength)
//   POST { id, is_featured } — toggle the featured slot (⭐ carousel)
// Platform admin only.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const agencyId = req.nextUrl.searchParams.get('agencyId') || undefined
  let query = db
    .from('broker_profiles')
    .select('id, profile_id, agency_id, public_name, title, avatar_url, phone, email_public, is_public, is_featured, years_experience, closed_deals_count')
    .order('public_name', { ascending: true })
  if (agencyId) query = query.eq('agency_id', agencyId)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, brokers: data || [] })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ ok: false, error: 'broker id required' }, { status: 400 })

  const { error } = await db
    .from('broker_profiles')
    .update({ is_featured: Boolean(body.is_featured) })
    .eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
