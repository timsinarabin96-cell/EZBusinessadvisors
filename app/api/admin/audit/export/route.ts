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
// GET /api/admin/audit/export — full audit-trail CSV export (SOC 2 evidence).
// Streams the COMPLETE admin action trail (not just the page-limited view),
// newest first, with the retention window applied. Filters mirror the audit
// page: ?action=…&targetType=…&q=…&days=365
// Platform admin only.
// =============================================================================

const csvEscape = (v: unknown): string => {
  const s = v == null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const sp = req.nextUrl.searchParams
  const action = sp.get('action') || undefined
  const targetType = sp.get('targetType') || undefined
  const q = (sp.get('q') || '').trim()
  const days = Math.min(Math.max(Number(sp.get('days') || 365), 1), 3650)

  let query = db
    .from('admin_audit_log')
    .select('*')
    .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
  if (action) query = query.eq('action', action)
  if (targetType) query = query.eq('target_type', targetType)
  if (q) {
    query = query.or(`target_label.ilike.%${q}%,actor_email.ilike.%${q}%,target_id.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const rows = (data || []) as Array<Record<string, unknown>>
  const headers = ['created_at', 'action', 'actor_email', 'target_type', 'target_id', 'target_label', 'details']
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h]
          if (h === 'details' && v && typeof v === 'object') return csvEscape(JSON.stringify(v))
          return csvEscape(v)
        })
        .join(','),
    ),
  ]
  const csv = lines.join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
