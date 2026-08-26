import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { recordAdminAudit, resolveAdminActor } from '@/lib/adminAudit'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/admin/users/import — bulk user creation from CSV (super admin only).
// Body: { users: [{ email, full_name?, role?, password?, agencyId? }] }
// Max 100 rows per batch. Creates each via the auth admin API (email confirmed),
// upserts the profile, links the agency. Returns per-row results so the UI can
// show which succeeded/failed and hand out temp passwords for generated ones.
// One audit entry for the whole batch.
// =============================================================================

const VALID_ROLES = ['super_admin', 'admin', 'broker', 'agent', 'owner', 'buyer']
const MAX_ROWS = 100

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const actor = await resolveAdminActor(req)

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const rows: any[] = Array.isArray(body.users) ? body.users : []
  if (!rows.length) return NextResponse.json({ ok: false, error: 'No users provided' }, { status: 400 })
  if (rows.length > MAX_ROWS) return NextResponse.json({ ok: false, error: `Max ${MAX_ROWS} rows per batch` }, { status: 400 })

  const results: { email: string; ok: boolean; userId?: string; password?: string; error?: string }[] = []
  let created = 0
  let failed = 0

  for (const row of rows) {
    const email = String(row.email || '').trim().toLowerCase()
    const fullName = String(row.full_name || '').trim() || null
    const role = VALID_ROLES.includes(row.role) ? row.role : 'agent'
    const agencyId = row.agencyId || null
    const agencyRole = row.agencyRole || 'broker'

    if (!email || !email.includes('@')) {
      failed++
      results.push({ email: email || '(missing)', ok: false, error: 'Invalid email' })
      continue
    }

    // Generate a password when the row doesn't provide one.
    const password = String(row.password || '').trim() || `Temp!${Math.random().toString(36).slice(2, 10)}`

    try {
      const { data: createdUser, error: authErr } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      })
      if (authErr) throw new Error(authErr.message)
      const userId = createdUser.user?.id
      if (!userId) throw new Error('No user id returned')

      const { error: profileErr } = await db.from('profiles').upsert({
        id: userId, email, full_name: fullName, role, status: 'active',
      }, { onConflict: 'id' })
      if (profileErr) throw new Error(profileErr.message)

      if (agencyId) {
        await db.from('agency_members').insert({ agency_id: agencyId, profile_id: userId, role: agencyRole, is_owner: false })
      }

      created++
      results.push({ email, ok: true, userId, password })
    } catch (e: any) {
      failed++
      results.push({ email, ok: false, error: e.message })
    }
  }

  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: 'bulk_import', targetType: 'user', targetId: null,
    targetLabel: `${created} created / ${failed} failed`,
    details: { attempted: rows.length, created, failed },
  })

  return NextResponse.json({ ok: true, created, failed, results })
}
