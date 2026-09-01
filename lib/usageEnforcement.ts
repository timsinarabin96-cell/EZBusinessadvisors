/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// usageEnforcement — server-side plan-limit enforcement (single source of truth).
// -----------------------------------------------------------------------------
// Called by listing-create, member-add, lead-create and deal-create flows.
// Counts REAL usage from the database (not client claims), resolves the
// agency's plan + any per-agency override, and returns a structured block
// with the exact limit and an upgrade prompt tied to the real pricing tiers.
//
// Override model: trial_settings rows keyed by agency_id (max_listings,
// max_agents, …) ALWAYS win — the boss grants a specific founding agency
// 10 listings without changing the tier defaults for everyone else.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export type UsageKind = 'listings' | 'agents' | 'leads' | 'deals' | 'storage'

export interface UsageCheckResult {
  allowed: boolean
  used: number
  max: number
  kind: UsageKind
  /** Set when blocked — human message with the real upgrade path. */
  reason?: string
  /** Set when blocked — link to the pricing/upgrade page. */
  upgradeUrl?: string
  /** Which plan resolved the limit (professional | enterprise | license | founding | free). */
  planType?: string
  /** True when the limit came from a per-agency override, not the tier default. */
  overridden?: boolean
}

/** Resolve the agency's effective limits: per-agency override > tier default. */
async function resolveLimits(agencyId: string): Promise<{
  planType: string
  maxListings: number
  maxAgents: number
  maxLeads: number
  maxDeals: number
  overridden: boolean
}> {
  const fallback = { planType: 'free', maxListings: 1, maxAgents: 0, maxLeads: 5, maxDeals: 0, overridden: false }

  if (!svc) return fallback
  const { data: agency } = await svc.from('agencies').select('plan_type, paid_plan_active, trial_active').eq('id', agencyId).maybeSingle()
  if (!agency) return fallback

  // Founding-agency grants + license + paid tiers.
  const planType = String(agency.plan_type || 'free')
  const tierKey = planType === 'enterprise' ? 'enterprise' : planType === 'license' ? 'license' : planType === 'founding' ? 'founding' : planType === 'professional' ? 'professional' : 'free'
  const { TIER_LIMITS } = await import('@/lib/trial')
  const tier = TIER_LIMITS[tierKey] || TIER_LIMITS.free

  // Per-agency override (trial_settings row for this agency) always wins.
  const { data: override } = await svc
    .from('trial_settings')
    .select('max_listings, max_agents, max_leads, max_deals')
    .eq('agency_id', agencyId)
    .maybeSingle()

  const hasOverride = !!(override && (override.max_listings != null || override.max_agents != null || override.max_leads != null || override.max_deals != null))
  return {
    planType: tierKey,
    maxListings: override?.max_listings ?? tier.maxListings,
    maxAgents: override?.max_agents ?? tier.maxAgents,
    maxLeads: override?.max_leads ?? tier.maxLeads,
    maxDeals: override?.max_deals ?? tier.maxDeals,
    overridden: hasOverride,
  }
}

const KIND_LABEL: Record<UsageKind, string> = {
  listings: 'listings',
  agents: 'team members',
  leads: 'leads',
  deals: 'deals',
  storage: 'storage',
}

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  professional: 'Professional ($499/mo)',
  enterprise: 'Enterprise ($899/mo)',
  license: 'White-Label License',
  founding: 'Founding Agency',
}

function upgradeUrlFor(planType: string): string {
  if (planType === 'free') return '/pricing'
  if (planType === 'professional') return '/pricing'
  return '/billing'
}

/**
 * Check whether `kind` can be incremented by 1 for this agency.
 * Counts real rows; returns { allowed:false, reason, upgradeUrl } when blocked.
 */
export async function checkAgencyUsage(
  agencyId: string,
  kind: UsageKind,
): Promise<UsageCheckResult> {
  const base: UsageCheckResult = { allowed: true, used: 0, max: 0, kind }
  if (!svc || !agencyId) return base

  const limits = await resolveLimits(agencyId)
  base.planType = limits.planType
  base.overridden = limits.overridden
  base.max = kind === 'listings' ? limits.maxListings : kind === 'agents' ? limits.maxAgents : kind === 'leads' ? limits.maxLeads : limits.maxDeals
  const max = base.max

  // Real usage counts.
  try {
    if (kind === 'listings') {
      const { count } = await svc
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .in('status', ['draft', 'active', 'pending_sale', 'under_contract'])
      base.used = count || 0
    } else if (kind === 'agents') {
      const { count } = await svc
        .from('agency_members')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
      base.used = count || 0
    } else if (kind === 'leads') {
      const [b, s] = await Promise.all([
        svc.from('buyer_leads').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId),
        svc.from('seller_leads').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId),
      ])
      base.used = (b.count || 0) + (s.count || 0)
    } else if (kind === 'deals') {
      const { count } = await svc
        .from('deals')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
      base.used = count || 0
    }
  } catch { /* counts are best-effort; treat as 0 */ }

  if (base.used >= max) {
    const plan = PLAN_LABEL[limits.planType] || limits.planType
    const overriddenNote = limits.overridden ? ' (custom limit set by Concord)' : ''
    base.allowed = false
    base.reason =
      max <= 0
        ? `Your plan (${plan}) includes 0 ${KIND_LABEL[kind]}${overriddenNote}. Upgrade to unlock ${KIND_LABEL[kind]}.`
        : `You've reached your plan limit: ${base.used}/${max} ${KIND_LABEL[kind]}${overriddenNote}. Upgrade ${plan} for more.`
    base.upgradeUrl = upgradeUrlFor(limits.planType)
  }
  return base
}

/** Convenience: throw-style check used by API routes. Returns null when OK. */
export async function usageBlock(agencyId: string, kind: UsageKind): Promise<{ error: string; upgradeUrl: string } | null> {
  const r = await checkAgencyUsage(agencyId, kind)
  if (r.allowed) return null
  return { error: r.reason || `Limit reached for ${kind}`, upgradeUrl: r.upgradeUrl || '/pricing' }
}
