/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Platform admin — server-side helpers for the platform owner (boss).
// Grants a full view across ALL tenants: agencies, users, listings,
// subscriptions, revenue. Only profiles marked super_admin can use these.
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest } from '@/lib/supabase/auth'

export type PlatformRole = 'super_admin'

export interface PlatformOverview {
  agencies: { total: number; active: number; paid: number; onTrial: number; locked: number }
  users: { total: number; brokers: number; agents: number; admins: number; superAdmins: number }
  listings: { total: number; published: number; draft: number; pendingReview: number }
  subscriptions: { total: number; mrrCents: number; activeSubs: number; trialing: number }
  successFees: { deals: number; totalFeeCents: number; paidFeeCents: number }
  featured: { slots: number; revenueCents: number }
  buyerPasses: { total: number; active: number; revenueCents: number }
  recentAgencies: any[]
  recentUsers: any[]
}

/** True when the request is from a platform super admin. */
export async function isPlatformAdmin(req: Request): Promise<boolean> {
  const authenticated = await authenticateProfileRequest(req as any)
  if (!authenticated) return false
  return authenticated.profile.role === 'super_admin'
}

/** Full platform overview — every tenant, user, listing, and dollar. */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const db = createServerClient()
  if (!db) {
    return { agencies: { total: 0, active: 0, paid: 0, onTrial: 0, locked: 0 }, users: { total: 0, brokers: 0, agents: 0, admins: 0, superAdmins: 0 }, listings: { total: 0, published: 0, draft: 0, pendingReview: 0 }, subscriptions: { total: 0, mrrCents: 0, activeSubs: 0, trialing: 0 }, successFees: { deals: 0, totalFeeCents: 0, paidFeeCents: 0 }, featured: { slots: 0, revenueCents: 0 }, buyerPasses: { total: 0, active: 0, revenueCents: 0 }, recentAgencies: [], recentUsers: [] }
  }

  const [agencies, profiles, listings, subs, recentAgencies, recentUsers, feeStats, featured, buyerPasses] = await Promise.all([
    db.from('agencies').select('id, name, slug, plan_type, is_active, paid_plan_active, trial_active, locked_at, created_at').order('created_at', { ascending: false }),
    db.from('profiles').select('id, email, full_name, role, status, created_at').order('created_at', { ascending: false }),
    db.from('listings').select('id, status, created_at'),
    db.from('subscriptions').select('id, tier, status, created_at'),
    db.from('agencies').select('id, name, slug, plan_type, paid_plan_active, created_at').order('created_at', { ascending: false }).limit(10),
    db.from('profiles').select('id, email, full_name, role, created_at').order('created_at', { ascending: false }).limit(15),
    db.from('platform_success_fee_stats').select('*').maybeSingle(),
    db.from('featured_slots').select('amount_cents, status'),
    db.from('buyer_subscriptions').select('status'),
  ])

  const a = agencies.data || []
  const p = profiles.data || []
  const l = listings.data || []
  const s = subs.data || []
  const fs = feeStats.data || {}
  const feat = featured.data || []
  const bp = buyerPasses.data || []

  const mrrCents = s.filter((x: any) => x.status === 'active').reduce((sum: number, x: any) => {
    const price: Record<string, number> = { free: 0, professional: 4900, enterprise: 9900 }
    return sum + (price[x.tier as string] ?? 0)
  }, 0)

  const featuredRevenue = feat.filter((x: any) => x.status !== 'refunded').reduce((sum: number, x: any) => sum + Number(x.amount_cents || 0), 0)
  const buyerPassRevenue = bp.filter((x: any) => x.status === 'active').length * 4900

  return {
    agencies: {
      total: a.length,
      active: a.filter((x: any) => x.is_active).length,
      paid: a.filter((x: any) => x.paid_plan_active).length,
      onTrial: a.filter((x: any) => x.trial_active).length,
      locked: a.filter((x: any) => x.locked_at).length,
    },
    users: {
      total: p.length,
      brokers: p.filter((x: any) => x.role === 'broker').length,
      agents: p.filter((x: any) => x.role === 'agent' || x.role === 'associate').length,
      admins: p.filter((x: any) => x.role === 'admin').length,
      superAdmins: p.filter((x: any) => x.role === 'super_admin').length,
    },
    listings: {
      total: l.length,
      published: l.filter((x: any) => x.status === 'published' || x.status === 'active').length,
      draft: l.filter((x: any) => x.status === 'draft').length,
      pendingReview: l.filter((x: any) => x.status === 'pending_review' || x.status === 'pending').length,
    },
    subscriptions: {
      total: s.length,
      mrrCents,
      activeSubs: s.filter((x: any) => x.status === 'active').length,
      trialing: s.filter((x: any) => x.status === 'trialing').length,
    },
    successFees: {
      deals: Number(fs.deals || 0),
      totalFeeCents: Number(fs.total_fee_cents || 0),
      paidFeeCents: Number(fs.paid_fee_cents || 0),
    },
    featured: { slots: feat.length, revenueCents: featuredRevenue },
    buyerPasses: {
      total: bp.length,
      active: bp.filter((x: any) => x.status === 'active' || x.status === 'trialing').length,
      revenueCents: buyerPassRevenue,
    },
    recentAgencies: recentAgencies.data || [],
    recentUsers: recentUsers.data || [],
  }
}

/** Fetch all agency settings (tenant config: domain + API keys) — admin view. */
export async function fetchAllAgencySettings(): Promise<any[]> {
  const db = createServerClient()
  if (!db) return []
  const { data } = await db.from('agency_settings').select('*').order('updated_at', { ascending: false })
  return (data as any[]) || []
}
