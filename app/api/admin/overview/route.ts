import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin, getPlatformOverview, fetchAllAgencySettings } from '@/lib/platform'

export const runtime = 'nodejs'

/**
 * GET /api/admin/overview
 * Platform owner (super admin) — full view across ALL tenants:
 * agencies, users, listings, subscriptions, MRR, and per-tenant settings.
 * Anyone else gets 403.
 */
export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const [overview, settings] = await Promise.all([getPlatformOverview(), fetchAllAgencySettings()])
  return NextResponse.json({ ok: true, overview, settings })
}

/**
 * POST /api/admin/overview — security actions.
 * body: { action: 'sign_out_all' } — revoke every session on the platform
 * except the caller's own. Audit-logged.
 */
export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }
  if (body.action !== 'sign_out_all') return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })

  const { data: { user: me } } = await db.auth.getUser()
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch(() => ({ data: { users: [] } }))
  const targets = (data?.users || []).filter((u: any) => u.id !== me?.id)
  let signedOut = 0
  for (const u of targets) {
    const { error } = await db.auth.admin.signOut(u.id)
    if (!error) signedOut++
  }

  const { recordAdminAudit, resolveAdminActor } = await import('@/lib/adminAudit')
  const actor = await resolveAdminActor(req)
  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: 'sign_out_all', targetType: 'settings', targetId: null, targetLabel: 'platform',
    details: { sessions_revoked: signedOut, of: targets.length },
  })

  return NextResponse.json({ ok: true, signedOut, total: targets.length })
}
