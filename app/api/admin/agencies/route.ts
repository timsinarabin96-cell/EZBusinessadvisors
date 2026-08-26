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
// /api/admin/agencies — platform tenant control (super admin only).
//   GET   — every agency with member/listing counts + subscription state.
//   PATCH — { id, action: suspend|unsuspend|lock|unlock, reason? }.
//           suspend = freeze tenant (is_active false, listings unpublished).
//           lock = payment hold (locked_at set, access kept).
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const [agencies, members, listings, subs] = await Promise.all([
    db.from('agencies').select('id, name, slug, plan_type, is_active, paid_plan_active, trial_active, locked_at, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('agency_members').select('agency_id, profile_id'),
    db.from('listings').select('agency_id, status'),
    db.from('subscriptions').select('agency_id, tier, status'),
  ])

  const memberCount = new Map<string, number>()
  for (const m of members.data || []) memberCount.set(m.agency_id, (memberCount.get(m.agency_id) || 0) + 1)
  const listingCount = new Map<string, number>()
  const liveListingCount = new Map<string, number>()
  for (const l of listings.data || []) {
    listingCount.set(l.agency_id, (listingCount.get(l.agency_id) || 0) + 1)
    if (l.status === 'active' || l.status === 'published') liveListingCount.set(l.agency_id, (liveListingCount.get(l.agency_id) || 0) + 1)
  }
  const subByAgency = new Map<string, any>()
  for (const s of subs.data || []) if (s.agency_id && !subByAgency.has(s.agency_id)) subByAgency.set(s.agency_id, s)

  const rows = (agencies.data || []).map((a: any) => ({
    ...a,
    members: memberCount.get(a.id) || 0,
    listings: listingCount.get(a.id) || 0,
    live_listings: liveListingCount.get(a.id) || 0,
    subscription: subByAgency.get(a.id) || null,
  }))
  return NextResponse.json({ ok: true, agencies: rows })
}

export async function PATCH(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const actor = await resolveAdminActor(req)

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const id = String(body.id || '')
  const action = String(body.action || '')
  const reason = body.reason ? String(body.reason).slice(0, 300) : null
  if (!id || !['suspend', 'unsuspend', 'lock', 'unlock'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'id and action required (suspend|unsuspend|lock|unlock)' }, { status: 400 })
  }

  const { data: agency } = await db.from('agencies').select('id, name').eq('id', id).maybeSingle()
  if (!agency) return NextResponse.json({ ok: false, error: 'Agency not found' }, { status: 404 })

  const now = new Date().toISOString()
  if (action === 'suspend') {
    await db.from('agencies').update({ is_active: false, locked_at: now }).eq('id', id)
    // Freeze the tenant's marketplace presence.
    try { await db.from('listings').update({ status: 'draft', review_stage: 'draft' }).eq('agency_id', id) } catch { /* best-effort */ }
  } else if (action === 'unsuspend') {
    await db.from('agencies').update({ is_active: true, locked_at: null }).eq('id', id)
  } else if (action === 'lock') {
    await db.from('agencies').update({ locked_at: now }).eq('id', id)
  } else if (action === 'unlock') {
    await db.from('agencies').update({ locked_at: null }).eq('id', id)
  }

  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: `agency_${action}`, targetType: 'agency', targetId: id, targetLabel: agency.name,
    details: { reason, listings_frozen: action === 'suspend' },
  })

  return NextResponse.json({ ok: true })
}
