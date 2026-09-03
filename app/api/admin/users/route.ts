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

// ---------------------------------------------------------------------------
// /api/admin/users — platform owner (boss) user management.
//   GET   — list all users (profiles + memberships + subscription + last login)
//   POST  — create a user (email/password + profile role + optional agency)
//   PATCH — role / status / agency link / BAN (kill-switch: auth block +
//           session revoke + listings unpublished) / LOCK (payment hold)
// Every mutation is recorded in the admin audit log.
// Super admin only.
// ---------------------------------------------------------------------------

const VALID_ROLES = ['super_admin', 'admin', 'broker', 'agent', 'owner', 'buyer']
const VALID_STATUSES = ['active', 'inactive', 'locked', 'banned']
const BAN_DURATION = '876000h' // 100 years — effectively permanent, revocable.

async function actorFor(req: NextRequest) {
  return resolveAdminActor(req)
}

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const [profiles, members, subs, authUsers] = await Promise.all([
    db.from('profiles').select('id, email, full_name, role, status, avatar_url, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('agency_members').select('profile_id, agency_id, role, is_owner'),
    db.from('subscriptions').select('profile_id, tier, status'),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch(() => ({ data: { users: [] } })),
  ])

  const authById = new Map<string, any>()
  for (const u of authUsers.data?.users || []) authById.set(u.id, u)

  const membersByUser = new Map<string, any[]>()
  for (const m of members.data || []) {
    const list = membersByUser.get(m.profile_id) || []
    list.push(m)
    membersByUser.set(m.profile_id, list)
  }
  const subByUser = new Map<string, any>()
  for (const s of subs.data || []) subByUser.set(s.profile_id, s)

  const users = (profiles.data || []).map((p: any) => {
    const auth = authById.get(p.id)
    return {
      ...p,
      last_login: auth?.last_sign_in_at || null,
      auth_banned: Boolean(auth?.banned_until),
      memberships: membersByUser.get(p.id) || [],
      subscription: subByUser.get(p.id) || null,
    }
  })
  return NextResponse.json({ ok: true, users })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const actor = await actorFor(req)

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  // --- Support toolbox: generate a recovery (login-as) link -------------------
  if (body.action === 'login_link') {
    const email = String(body.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 })
    const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email })
    const token = data?.properties?.hashed_token
    if (error || !token) return NextResponse.json({ ok: false, error: error?.message || 'Failed to generate link' }, { status: 400 })
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://concorddeal.com'
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ytcvlvisufxmmzeblmwx.supabase.co'
    const url = `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(token)}&type=recovery&redirect_to=${encodeURIComponent(appUrl + '/auth/reset-password')}`
    await recordAdminAudit({
      actorId: actor.id, actorEmail: actor.email,
      action: 'login_link_generated', targetType: 'user', targetId: null, targetLabel: email,
      details: { note: 'Recovery link generated (login-as support tool)' },
    })
    return NextResponse.json({ ok: true, url, email })
  }

  // --- Create a user ----------------------------------------------------------

  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const fullName = String(body.full_name || '').trim()
  const role = VALID_ROLES.includes(body.role) ? body.role : 'agent'
  const agencyId = body.agencyId || null
  const agencyRole = body.agencyRole || 'broker'

  if (!email || !email.includes('@')) return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ ok: false, error: 'Password must be 6+ chars' }, { status: 400 })

  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 400 })
  const userId = created.user?.id
  if (!userId) return NextResponse.json({ ok: false, error: 'Failed to create user' }, { status: 500 })

  const { error: profileErr } = await db.from('profiles').upsert({
    id: userId, email, full_name: fullName || null, role, status: 'active',
  }, { onConflict: 'id' })
  if (profileErr) return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 })

  if (agencyId) {
    await db.from('agency_members').insert({ agency_id: agencyId, profile_id: userId, role: agencyRole, is_owner: false })
  }

  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: 'create_user', targetType: 'user', targetId: userId, targetLabel: email,
    details: { role, agencyId, agencyRole },
  })

  return NextResponse.json({ ok: true, userId })
}

export async function PATCH(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const actor = await actorFor(req)

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const userId = String(body.userId || '')
  if (!userId) return NextResponse.json({ ok: false, error: 'userId required' }, { status: 400 })

  // Load the target for audit labels + guards.
  const { data: target } = await db.from('profiles').select('id, email, full_name, role, status').eq('id', userId).maybeSingle()
  if (!target) return NextResponse.json({ ok: false, error: 'User not found' }, { status: 404 })
  const label = target.email || target.full_name || userId

  const patch: Record<string, unknown> = {}
  const audit: { action: string; details: Record<string, unknown> }[] = []

  // --- Role change -----------------------------------------------------------
  if (body.role && VALID_ROLES.includes(body.role) && body.role !== target.role) {
    patch.role = body.role
    audit.push({ action: 'role_change', details: { from: target.role, to: body.role } })
  }

  // --- Status / kill-switch ---------------------------------------------------
  if (body.status && VALID_STATUSES.includes(body.status) && body.status !== target.status) {
    patch.status = body.status

    if (body.status === 'banned') {
      // REAL kill-switch: block auth, kill sessions, pull listings off the market.
      await db.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION }).catch(() => {})
      await db.auth.admin.signOut(userId).catch(() => {})
      try {
        await db.from('listings').update({ status: 'draft', review_stage: 'draft' }).eq('agent_id', userId)
      } catch { /* best-effort */ }
      audit.push({ action: 'ban', details: { reason: body.reason || null, listings_unpublished: true, sessions_revoked: true } })
    } else if (body.status === 'active') {
      await db.auth.admin.updateUserById(userId, { ban_duration: 'none' }).catch(() => {})
      audit.push({ action: 'unban', details: { from: target.status } })
    } else if (body.status === 'locked') {
      audit.push({ action: 'lock', details: { reason: body.reason || null } })
    } else if (body.status === 'inactive') {
      audit.push({ action: 'status_change', details: { from: target.status, to: 'inactive' } })
    }
  }

  // --- Profile fields ---------------------------------------------------------
  if (body.full_name !== undefined) patch.full_name = body.full_name

  if (Object.keys(patch).length) {
    const { error } = await db.from('profiles').update(patch).eq('id', userId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // --- Agency link ------------------------------------------------------------
  if (body.agencyId !== undefined) {
    if (body.agencyId) {
      await db.from('agency_members').upsert({
        agency_id: body.agencyId, profile_id: userId, role: body.agencyRole || 'broker', is_owner: Boolean(body.isOwner),
      }, { onConflict: 'agency_id,profile_id' })
      audit.push({ action: 'agency_link', details: { agencyId: body.agencyId, role: body.agencyRole || 'broker' } })
    } else {
      await db.from('agency_members').delete().eq('profile_id', userId)
      audit.push({ action: 'agency_link', details: { agencyId: null } })
    }
  }

  for (const entry of audit) {
    await recordAdminAudit({
      actorId: actor.id, actorEmail: actor.email,
      action: entry.action, targetType: 'user', targetId: userId, targetLabel: label,
      details: entry.details,
    })
  }

  return NextResponse.json({ ok: true })
}
