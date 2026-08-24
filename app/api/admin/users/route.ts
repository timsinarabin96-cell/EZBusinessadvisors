import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// /api/admin/users — platform owner (boss) user management.
//   GET  — list all users (profiles + memberships + subscription)
//   POST — create a user (email/password + profile role + optional agency)
//   PATCH— update role, status, agency link, plan
// Super admin only.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const [profiles, members, subs] = await Promise.all([
    db.from('profiles').select('id, email, full_name, role, status, avatar_url, created_at').order('created_at', { ascending: false }).limit(200),
    db.from('agency_members').select('profile_id, agency_id, role, is_owner'),
    db.from('subscriptions').select('profile_id, tier, status'),
  ])

  const membersByUser = new Map<string, any[]>()
  for (const m of members.data || []) {
    const list = membersByUser.get(m.profile_id) || []
    list.push(m)
    membersByUser.set(m.profile_id, list)
  }
  const subByUser = new Map<string, any>()
  for (const s of subs.data || []) subByUser.set(s.profile_id, s)

  const users = (profiles.data || []).map((p: any) => ({
    ...p,
    memberships: membersByUser.get(p.id) || [],
    subscription: subByUser.get(p.id) || null,
  }))
  return NextResponse.json({ ok: true, users })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const fullName = String(body.full_name || '').trim()
  const role = ['super_admin', 'admin', 'broker', 'agent', 'owner', 'buyer'].includes(body.role) ? body.role : 'agent'
  const agencyId = body.agencyId || null
  const agencyRole = body.agencyRole || 'broker'

  if (!email || !email.includes('@')) return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ ok: false, error: 'Password must be 6+ chars' }, { status: 400 })

  // Create auth user (admin bypass — no email confirmation needed).
  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 400 })
  const userId = created.user?.id
  if (!userId) return NextResponse.json({ ok: false, error: 'Failed to create user' }, { status: 500 })

  // Upsert profile.
  const { error: profileErr } = await db.from('profiles').upsert({
    id: userId, email, full_name: fullName || null, role, status: 'active',
  }, { onConflict: 'id' })
  if (profileErr) return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 })

  // Link to agency if requested.
  if (agencyId) {
    await db.from('agency_members').insert({ agency_id: agencyId, profile_id: userId, role: agencyRole, is_owner: false })
  }

  return NextResponse.json({ ok: true, userId })
}

export async function PATCH(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const userId = String(body.userId || '')
  if (!userId) return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.role) patch.role = body.role
  if (body.status) patch.status = body.status
  if (body.full_name !== undefined) patch.full_name = body.full_name

  if (Object.keys(patch).length) {
    const { error } = await db.from('profiles').update(patch).eq('id', userId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Agency link management.
  if (body.agencyId !== undefined) {
    if (body.agencyId) {
      await db.from('agency_members').upsert({
        agency_id: body.agencyId, profile_id: userId, role: body.agencyRole || 'broker', is_owner: Boolean(body.isOwner),
      }, { onConflict: 'agency_id,profile_id' })
    } else {
      await db.from('agency_members').delete().eq('profile_id', userId)
    }
  }

  return NextResponse.json({ ok: true })
}
