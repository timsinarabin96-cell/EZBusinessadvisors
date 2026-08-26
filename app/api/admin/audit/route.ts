import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/admin/audit — the platform's admin action trail.
// Filters: ?action=ban&targetType=user&q=email&limit=200
// Platform admin only. Newest first.
// =============================================================================

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
  const limit = Math.min(Number(sp.get('limit') || 200), 500)

  let query = db.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(limit)
  if (action) query = query.eq('action', action)
  if (targetType) query = query.eq('target_type', targetType)
  if (q) {
    query = query.or(`target_label.ilike.%${q}%,actor_email.ilike.%${q}%,target_id.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Distinct action names for the filter dropdown.
  const { data: actions } = await db.from('admin_audit_log').select('action').limit(1000)
  const actionOptions = Array.from(new Set((actions || []).map((a: any) => a.action))).sort()

  return NextResponse.json({ ok: true, entries: data || [], actionOptions })
}
