import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { recordAdminAudit, resolveAdminActor } from '@/lib/adminAudit'

export const runtime = 'nodejs'

// =============================================================================
// /api/admin/subscriptions — revenue ops (super admin only).
//   GET  ?scope=watchlist — subscriptions with profile email; past_due/unpaid
//         first, with days overdue. ?scope=success-fees — recorded success
//         fees joined with agency + listing.
//   PATCH { id, tier?, status?, action?: 'mark_paid'|'refund'|'cancel' } —
//         manual subscription adjustments, audit-logged.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const scope = req.nextUrl.searchParams.get('scope') || 'watchlist'

  if (scope === 'success-fees') {
    const [fees, agencies, listings] = await Promise.all([
      db.from('deal_success_fees').select('*').order('created_at', { ascending: false }).limit(500),
      db.from('agencies').select('id, name'),
      db.from('listings').select('id, business_name'),
    ])
    const agencyName = new Map((agencies.data || []).map((a: any) => [a.id, a.name]))
    const listingName = new Map((listings.data || []).map((l: any) => [l.id, l.business_name]))
    const rows = (fees.data || []).map((f: any) => ({
      ...f,
      agency_name: agencyName.get(f.agency_id) || '—',
      business_name: listingName.get(f.listing_id) || '—',
    }))
    const totals = {
      recorded: (rows as any[]).filter((r) => r.status === 'recorded').reduce((s, r) => s + Number(r.fee_cents || 0), 0),
      invoiced: (rows as any[]).filter((r) => r.status === 'invoiced').reduce((s, r) => s + Number(r.fee_cents || 0), 0),
      paid: (rows as any[]).filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.fee_cents || 0), 0),
      waived: (rows as any[]).filter((r) => r.status === 'waived').reduce((s, r) => s + Number(r.fee_cents || 0), 0),
    }
    return NextResponse.json({ ok: true, fees: rows, totals })
  }

  const [subs, profiles] = await Promise.all([
    db.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(500),
    db.from('profiles').select('id, email, full_name'),
  ])
  const profileById = new Map((profiles.data || []).map((p: any) => [p.id, p]))
  const now = Date.now()
  const rows = (subs.data || []).map((s: any) => {
    const end = s.current_period_end ? new Date(s.current_period_end).getTime() : null
    const daysOverdue = end && end < now ? Math.floor((now - end) / 86400000) : 0
    const p = profileById.get(s.profile_id) || {}
    return { ...s, email: p.email || '—', full_name: p.full_name || '—', days_overdue: daysOverdue }
  })
  const watchlist = rows
    .filter((s: any) => ['past_due', 'unpaid', 'incomplete'].includes(s.status) || (s.status === 'active' && s.days_overdue > 0))
    .sort((a: any, b: any) => b.days_overdue - a.days_overdue)

  return NextResponse.json({ ok: true, subscriptions: rows, watchlist })
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
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const { data: sub } = await db.from('subscriptions').select('id, profile_id, tier, status, agency_id').eq('id', id).maybeSingle()
  if (!sub) return NextResponse.json({ ok: false, error: 'Subscription not found' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  const auditDetails: Record<string, unknown> = { from_tier: sub.tier, from_status: sub.status }

  if (body.tier && ['starter', 'professional', 'enterprise', 'license'].includes(body.tier) && body.tier !== sub.tier) {
    patch.tier = body.tier
    auditDetails.to_tier = body.tier
  }
  if (body.status && ['trialing', 'active', 'past_due', 'canceled', 'refunded'].includes(body.status) && body.status !== sub.status) {
    patch.status = body.status
    auditDetails.to_status = body.status
  }
  if (body.action === 'mark_paid') {
    patch.status = 'active'
    auditDetails.to_status = 'active'
  } else if (body.action === 'refund') {
    patch.status = 'refunded'
    auditDetails.to_status = 'refunded'
  } else if (body.action === 'cancel') {
    patch.status = 'canceled'
    auditDetails.to_status = 'canceled'
  }

  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, noop: true })

  const { error } = await db.from('subscriptions').update(patch).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: 'subscription_adjust', targetType: 'subscription', targetId: id,
    targetLabel: sub.profile_id || id, details: auditDetails,
  })

  return NextResponse.json({ ok: true })
}
