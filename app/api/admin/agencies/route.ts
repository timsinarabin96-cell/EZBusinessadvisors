import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'

export const runtime = 'nodejs'

/**
 * GET /api/admin/agencies — platform admin: list agencies for user
 * management (the admin/users page needs id + name for its agency links).
 * Platform admin only.
 */
export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data, error } = await db
    .from('agencies')
    .select('id, name, slug, plan_type, paid_plan_active, trial_active, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, agencies: data || [] })
}
