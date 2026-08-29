/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * GET /api/store/settings — owner reads store settings (supplier email).
 * POST /api/store/settings — owner sets settings. Body: { supplier_email }
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  if (!auth.memberships.some((m) => m.is_owner || m.role === 'admin')) {
    return forbiddenResponse('Owner access required')
  }
  const { data } = await db.from('store_settings').select('*').eq('key', 'supplier_email').maybeSingle()
  return NextResponse.json({ ok: true, supplier_email: data?.value || '' })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  if (!auth.memberships.some((m) => m.is_owner || m.role === 'admin')) {
    return forbiddenResponse('Owner access required')
  }
  const body = await req.json().catch(() => ({}))
  const email = String(body?.supplier_email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid supplier email required' }, { status: 400 })
  }
  await db.from('store_settings').upsert(
    { key: 'supplier_email', value: email, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return NextResponse.json({ ok: true, supplier_email: email })
}
