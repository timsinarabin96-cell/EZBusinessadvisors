/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  authenticateProfileRequest,
  canManageTeam,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/supabase/auth'

export const runtime = 'nodejs'

// =============================================================================
// POST/PATCH/DELETE /api/agency/members — server-side (service role) member
// management for Agency Admin.
// -----------------------------------------------------------------------------
// WHY: the client-side insert/update/delete on `agency_members` is rejected by
// the DB insert policy (`agency_members_insert_admin_only` requires
// is_admin() = role 'admin'), so agency OWNERS could never add/remove/role-
// change members through the UI. The invite flow already works because it
// writes server-side with the service role; this route does the same for the
// admin panel, gated by canManageTeam (owner/admin/broker).
// =============================================================================

function getDb() {
  const db = createServerClient()
  if (!db) return null
  return db
}

/** POST — add a member. { agencyId, email, role } — email lookup server-side
 *  so owners never paste raw profile UUIDs. Returns { added: true } when the
 *  account exists, or { code: 'NO_PROFILE' } so the UI can fall back to invite. */
export async function POST(req: NextRequest) {
  const db = getDb()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body?.agencyId || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const role = String(body?.role || 'broker').trim()
  if (!agencyId || !email) {
    return NextResponse.json({ ok: false, error: 'agencyId and email are required' }, { status: 400 })
  }
  if (!canManageTeam(auth, agencyId)) return forbiddenResponse()

  // Seat limit gate (server-side, authoritative) — 2026-09-01 usage overhaul.
  const { usageBlock } = await import('@/lib/usageEnforcement')
  const blocked = await usageBlock(agencyId, 'agents')
  if (blocked) {
    return NextResponse.json({ ok: false, error: blocked.error, code: 'USAGE_LIMIT', upgradeUrl: blocked.upgradeUrl }, { status: 429 })
  }

  // Resolve the profile by email (service role — no client-side UUID needed).
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (profileError) {
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 })
  }
  if (!profile) {
    // No account yet — let the UI create an invite instead.
    return NextResponse.json({ ok: false, code: 'NO_PROFILE', error: 'No account found for this email' }, { status: 404 })
  }

  const { error } = await db.from('agency_members').insert({
    agency_id: agencyId,
    profile_id: profile.id,
    role,
    is_owner: false,
  })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, added: true })
}

/** PATCH — update a member's role. { memberId, role } */
export async function PATCH(req: NextRequest) {
  const db = getDb()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const memberId = String(body?.memberId || '').trim()
  const role = String(body?.role || '').trim()
  if (!memberId || !role) {
    return NextResponse.json({ ok: false, error: 'memberId and role are required' }, { status: 400 })
  }

  const { data: member, error: fetchError } = await db
    .from('agency_members')
    .select('id, agency_id, is_owner')
    .eq('id', memberId)
    .maybeSingle()
  if (fetchError) return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 })
  if (!member) return NextResponse.json({ ok: false, error: 'Member not found' }, { status: 404 })
  if (member.is_owner) {
    return NextResponse.json({ ok: false, error: 'Cannot change the owner role' }, { status: 400 })
  }
  if (!canManageTeam(auth, member.agency_id)) return forbiddenResponse()

  const { error } = await db.from('agency_members').update({ role }).eq('id', memberId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE — remove a member. { memberId } */
export async function DELETE(req: NextRequest) {
  const db = getDb()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const memberId = String(body?.memberId || '').trim()
  if (!memberId) {
    return NextResponse.json({ ok: false, error: 'memberId is required' }, { status: 400 })
  }

  const { data: member, error: fetchError } = await db
    .from('agency_members')
    .select('id, agency_id, is_owner')
    .eq('id', memberId)
    .maybeSingle()
  if (fetchError) return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 })
  if (!member) return NextResponse.json({ ok: false, error: 'Member not found' }, { status: 404 })
  if (member.is_owner) {
    return NextResponse.json({ ok: false, error: 'Cannot remove the owner' }, { status: 400 })
  }
  if (!canManageTeam(auth, member.agency_id)) return forbiddenResponse()

  const { error } = await db.from('agency_members').delete().eq('id', memberId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
