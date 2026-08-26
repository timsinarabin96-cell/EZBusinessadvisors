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
// GET /api/admin/legal-vault — the admin-only Legal Vault.
//   ?slug=  → single document (full markdown body)
//   no args → list of all documents (id, slug, title, category, version, dates)
// Platform admin only. RLS additionally blocks non-admin rows at the DB level.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const slug = req.nextUrl.searchParams.get('slug')

  if (slug) {
    const { data, error } = await db.from('legal_vault').select('*').eq('slug', slug).maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
    if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, doc: data })
  }

  const { data, error } = await db
    .from('legal_vault')
    .select('id, slug, title, category, version, updated_at, created_at')
    .order('category', { ascending: true })
    .order('title', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
  return NextResponse.json({ ok: true, docs: data || [] })
}
