import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { recordAdminAudit, resolveAdminActor } from '@/lib/adminAudit'

export const runtime = 'nodejs'

// =============================================================================
// /api/admin/listings — platform moderation queue (super admin only).
//   GET   ?stage=&q=&agencyId=&flagged=  — every listing across all tenants,
//         joined with agency + owner info. Newest first.
//   PATCH { id, action, reason? } — approve | reject | unpublish | flag |
//         clear_flag. Every action is audit-logged.
// =============================================================================

const STAGES = ['pending_review', 'approved', 'rejected', 'changes_requested', 'agent_review', 'draft', 'all']

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const sp = req.nextUrl.searchParams
  const stage = sp.get('stage') || 'pending_review'
  const q = (sp.get('q') || '').trim()
  const agencyId = sp.get('agencyId') || undefined
  const flagged = sp.get('flagged')
  const limit = Math.min(Number(sp.get('limit') || 100), 300)

  let query = db
    .from('listings')
    .select('id, business_name, status, review_stage, flagged, flag_reasons, asking_price, annual_revenue, sde, created_at, published_at, agency_id, agent_id, moderation_reason, moderated_at, city, state')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (stage !== 'all') query = query.eq('review_stage', stage)
  if (q) query = query.ilike('business_name', `%${q}%`)
  if (agencyId) query = query.eq('agency_id', agencyId)
  if (flagged === 'true') query = query.eq('flagged', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Join agency + owner names client-side (avoid FK-name guessing).
  const agencyIds = Array.from(new Set((data || []).map((l: any) => l.agency_id).filter(Boolean)))
  const profileIds = Array.from(new Set((data || []).map((l: any) => l.agent_id).filter(Boolean)))
  const [agencies, profiles] = await Promise.all([
    agencyIds.length ? db.from('agencies').select('id, name').in('id', agencyIds) : Promise.resolve({ data: [] }),
    profileIds.length ? db.from('profiles').select('id, email, full_name').in('id', profileIds) : Promise.resolve({ data: [] }),
  ])
  const agencyName = new Map((agencies.data || []).map((a: any) => [a.id, a.name]))
  const owner = new Map((profiles.data || []).map((p: any) => [p.id, p]))

  const listings = (data || []).map((l: any) => ({
    ...l,
    agency_name: agencyName.get(l.agency_id) || '—',
    owner_name: owner.get(l.agent_id)?.full_name || owner.get(l.agent_id)?.email || '—',
    owner_email: owner.get(l.agent_id)?.email || '—',
  }))
  return NextResponse.json({ ok: true, listings })
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
  const reason = body.reason ? String(body.reason).slice(0, 500) : null
  if (!id || !action) return NextResponse.json({ ok: false, error: 'id and action required' }, { status: 400 })
  if (!['approve', 'reject', 'unpublish', 'flag', 'clear_flag'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  }

  const { data: listing } = await db.from('listings').select('id, business_name, agency_id').eq('id', id).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const now = new Date().toISOString()
  let patch: Record<string, unknown> = {}
  let auditAction = 'moderate_listing'

  switch (action) {
    case 'approve':
      patch = { status: 'active', review_stage: 'approved', flagged: false, flag_reasons: [], moderation_reason: null, moderated_by: actor.id, moderated_at: now, published_at: now }
      break
    case 'reject':
      patch = { status: 'draft', review_stage: 'rejected', moderation_reason: reason || 'Rejected by platform admin', moderated_by: actor.id, moderated_at: now }
      break
    case 'unpublish':
      patch = { status: 'draft', review_stage: 'draft', moderation_reason: reason || null, moderated_by: actor.id, moderated_at: now }
      break
    case 'flag':
      patch = { flagged: true, flag_reasons: [...((listing as any).flag_reasons || []), reason || 'Flagged by platform admin'] }
      break
    case 'clear_flag':
      patch = { flagged: false, flag_reasons: [] }
      break
  }

  const { error } = await db.from('listings').update(patch).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: auditAction, targetType: 'listing', targetId: id,
    targetLabel: listing.business_name || id,
    details: { action, reason, agencyId: listing.agency_id, to_stage: (patch.review_stage as string) || null },
  })

  return NextResponse.json({ ok: true })
}
