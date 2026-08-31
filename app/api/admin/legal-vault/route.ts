/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { recordAdminAudit, resolveAdminActor } from '@/lib/adminAudit'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/admin/legal-vault — the admin-only Legal Vault.
//   ?slug=  → single document (full markdown body)
//   no args → list of all documents (id, slug, title, category, version, dates)
// Platform admin only. RLS additionally blocks non-admin rows at the DB level.
//
// EVERY access is audited (who, what document, when, view vs export) into
// admin_audit_log — visible + exportable at /admin/audit.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const actor = await resolveAdminActor(req)

  const slug = req.nextUrl.searchParams.get('slug')

  if (slug) {
    const { data, error } = await db.from('legal_vault').select('*').eq('slug', slug).maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
    if (!data) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    // AUDIT: document view — who, what, when.
    await recordAdminAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'legal_vault_view',
      targetType: 'legal_vault',
      targetId: (data as { id?: string }).id || null,
      targetLabel: (data as { title?: string }).title || (data as { slug?: string }).slug || null,
      details: { slug: (data as { slug?: string }).slug || null, category: (data as { category?: string }).category || null, version: (data as { version?: string }).version || null },
    })
    return NextResponse.json({ ok: true, doc: data })
  }

  const { data, error } = await db
    .from('legal_vault')
    .select('id, slug, title, category, version, updated_at, created_at')
    .order('category', { ascending: true })
    .order('title', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })
  // AUDIT: vault list access — who, what (list), when.
  await recordAdminAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: 'legal_vault_list',
    targetType: 'legal_vault',
    targetId: null,
    targetLabel: 'Legal Vault index',
    details: { count: (data || []).length },
  })
  return NextResponse.json({ ok: true, docs: data || [] })
}
