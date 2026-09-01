/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/**
 * GET /api/admin/usage — per-agency usage + limits + overrides (platform admin).
 * Returns for every agency: plan, paid/trial state, real usage counts
 * (listings/agents/leads/deals), tier limits, and any per-agency override.
 *
 * PATCH /api/admin/usage — set per-agency override limits.
 * Body: { agencyId, maxListings?, maxAgents?, maxLeads?, maxDeals?, clear? }
 */
export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access required' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data: agencies } = await db
    .from('agencies')
    .select('id, name, slug, plan_type, paid_plan_active, trial_active, created_at')
    .order('created_at', { ascending: true })
    .limit(500)

  const { data: overrides } = await db.from('trial_settings').select('*').not('agency_id', 'is', null)
  const overrideByAgency = new Map<string, any>((overrides || []).map((o) => [o.agency_id, o]))

  const { TIER_LIMITS } = await import('@/lib/trial')
  const rows = []

  for (const a of agencies || []) {
    const tierKey = a.plan_type === 'enterprise' ? 'enterprise' : a.plan_type === 'license' ? 'license' : a.plan_type === 'founding' ? 'founding' : a.plan_type === 'professional' ? 'professional' : 'free'
    const tier = TIER_LIMITS[tierKey] || TIER_LIMITS.free
    const ov = overrideByAgency.get(a.id)

    const [listings, agents, buyerLeads, sellerLeads, deals] = await Promise.all([
      db.from('listings').select('id', { count: 'exact', head: true }).eq('agency_id', a.id).in('status', ['draft', 'active', 'pending_sale', 'under_contract']),
      db.from('agency_members').select('id', { count: 'exact', head: true }).eq('agency_id', a.id),
      db.from('buyer_leads').select('id', { count: 'exact', head: true }).eq('agency_id', a.id),
      db.from('seller_leads').select('id', { count: 'exact', head: true }).eq('agency_id', a.id),
      db.from('deals').select('id', { count: 'exact', head: true }).eq('agency_id', a.id),
    ])

    rows.push({
      agency: { id: a.id, name: a.name, slug: a.slug, planType: a.plan_type, paid: a.paid_plan_active, trial: a.trial_active },
      usage: {
        listings: listings.count || 0,
        agents: agents.count || 0,
        leads: (buyerLeads.count || 0) + (sellerLeads.count || 0),
        deals: deals.count || 0,
      },
      limits: {
        listings: ov?.max_listings ?? tier.maxListings,
        agents: ov?.max_agents ?? tier.maxAgents,
        leads: ov?.max_leads ?? tier.maxLeads,
        deals: ov?.max_deals ?? tier.maxDeals,
      },
      override: ov
        ? { maxListings: ov.max_listings ?? null, maxAgents: ov.max_agents ?? null, maxLeads: ov.max_leads ?? null, maxDeals: ov.max_deals ?? null }
        : null,
    })
  }

  return NextResponse.json({ ok: true, agencies: rows, tierLimits: TIER_LIMITS })
}

/** PATCH — set per-agency override limits (founding grants, custom deals). */
export async function PATCH(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access required' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body?.agencyId || '').trim()
  if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId required' }, { status: 400 })

  const patch: Record<string, number> = {}
  for (const [field, col] of [['maxListings', 'max_listings'], ['maxAgents', 'max_agents'], ['maxLeads', 'max_leads'], ['maxDeals', 'max_deals']] as const) {
    if (body[field] !== undefined && body[field] !== null) {
      const n = Math.max(0, parseInt(String(body[field]), 10) || 0)
      patch[col] = n
    }
  }

  if (body.clear === true) {
    await db.from('trial_settings').delete().eq('agency_id', agencyId)
    return NextResponse.json({ ok: true, cleared: true })
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'Provide at least one limit (maxListings/maxAgents/maxLeads/maxDeals) or clear=true' }, { status: 400 })
  }

  await db.from('trial_settings').upsert(
    { agency_id: agencyId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'agency_id' },
  )
  return NextResponse.json({ ok: true, agencyId, patch })
}
