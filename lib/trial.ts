/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// Trial helpers — client-side trial status, days remaining, usage limits, and
// the trial vs paid feature matrix. Mirrors the authority of the server cron /
// conversion routes; these helpers drive UI badges, banners, and enforceLimits
// gate-checks in the client. Data comes from the current user's agency.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import type { Agency } from '@/lib/agencies'

export type TrialStatus = 'active' | 'ending_soon' | 'expired' | 'grace' | 'locked' | 'paid' | 'none'

export interface TrialState {
  status: TrialStatus
  daysRemaining: number
  trialStart: string | null
  trialEnd: string | null
  graceEnd: string | null
  lockedAt: string | null
  planType: string
  isTrial: boolean
  isPaid: boolean
}

export interface AgencyUsage {
  listingsUsed: number
  leadsUsed: number
  dealsUsed: number
  storageUsedBytes: number
  agentsUsed: number
}

export interface UsageLimits {
  maxListings: number
  maxLeads: number
  maxDeals: number
  maxAgents: number
  maxStorageBytes: number
}

/** Reserved feature gate keys — see FEATURE_MATRIX. */
export type FeatureKey =
  | 'listings' | 'leads' | 'deals' | 'agents' | 'storage'
  | 'cim_bov' | 'ai_agents' | 'social_media' | 'email_campaigns' | 'branding'

export interface Feature {
  key: FeatureKey
  label: string
  trial: boolean | number | string
  paid: boolean | number | string
  kind: 'bool' | 'limit'
}

/** Trial vs Paid feature matrix (matches the request spec). */
export const FEATURE_MATRIX: Feature[] = [
  { key: 'listings', label: 'Listings', trial: 1, paid: '10–20 by plan', kind: 'limit' },
  { key: 'leads', label: 'Leads', trial: 5, paid: '500–2,000 by plan', kind: 'limit' },
  { key: 'deals', label: 'Deals', trial: 0, paid: 'CRM license only', kind: 'limit' },
  { key: 'agents', label: 'Agents', trial: 0, paid: '5–10 by plan', kind: 'limit' },
  { key: 'storage', label: 'Storage', trial: 0, paid: '10–50GB by plan', kind: 'limit' }, // MB
  { key: 'cim_bov', label: 'CIM / BOV Generators', trial: false, paid: true, kind: 'bool' },
  { key: 'ai_agents', label: 'AI Agents', trial: false, paid: true, kind: 'bool' },
  { key: 'social_media', label: 'Social Media', trial: false, paid: true, kind: 'bool' },
  { key: 'email_campaigns', label: 'Email Campaigns', trial: false, paid: true, kind: 'bool' },
  { key: 'branding', label: 'Branding', trial: 'Basic', paid: 'Full', kind: 'bool' },
]

export const PLAN_NAMES: Record<string, string> = {
  free: 'Owner', professional: 'Professional', enterprise: 'Enterprise',
}

const DAY_MS = 86_400_000
export const ENDING_SOON_DAYS = 3

/** Determine trial/plan status from an agency row. */
export function statusFromAgency(a: Agency | null): TrialState {
  const empty: TrialState = {
    status: 'none', daysRemaining: 0, trialStart: null, trialEnd: null,
    graceEnd: null, lockedAt: null, planType: 'free', isTrial: false, isPaid: false,
  }
  if (!a) return empty

  const now = Date.now()
  const trialEnd = a.trial_end_date ? new Date(a.trial_end_date).getTime() : null
  const trialStart = a.trial_start_date ? new Date(a.trial_start_date).getTime() : null
  const graceEnd = a.grace_end_date ? new Date(a.grace_end_date).getTime() : null
  const lockedAt = a.locked_at ? new Date(a.locked_at).getTime() : null
  const planType = (a as any).plan_type || 'free'

  if (a.paid_plan_active) {
    return { ...empty, status: 'paid', planType, isPaid: true }
  }

  const isTrial = !!a.trial_active && !!trialEnd

  if (isTrial && trialEnd) {
    const days = Math.ceil((trialEnd - now) / DAY_MS)
    return {
      status: days <= ENDING_SOON_DAYS ? 'ending_soon' : 'active',
      daysRemaining: Math.max(0, days), trialStart: a.trial_start_date, trialEnd: a.trial_end_date,
      graceEnd: a.grace_end_date || null, lockedAt: a.locked_at || null, planType,
      isTrial: true, isPaid: false,
    }
  }

  // Trial ended — was there a grace window?
  if (graceEnd) {
    if (now < graceEnd) {
      return { ...empty, status: 'grace', graceEnd: a.grace_end_date, trialStart: a.trial_start_date, daysRemaining: Math.ceil((graceEnd - now) / DAY_MS), planType }
    }
    // past grace but not locked yet
    if (!lockedAt) {
      return { ...empty, status: 'expired', graceEnd: a.grace_end_date, trialStart: a.trial_start_date, planType }
    }
    return { ...empty, status: 'locked', lockedAt: a.locked_at, trialStart: a.trial_start_date, planType }
  }

  if (lockedAt) return { ...empty, status: 'locked', lockedAt: a.locked_at, planType }
  return { ...empty, status: 'expired', trialStart: a.trial_start_date, planType }
}

/** Per-tier usage limits — the source of truth for paid plans. */
// Aligned 2026-09-01 with lib/pricing.ts (the ONLY pricing truth):
//   free          → 1 listing, 0 agent seats (owner self-serve, no CRM)
//   professional  → 10 listings, 5 seats ($499/mo, $4,790/yr)
//   enterprise    → 25 listings, 15 seats ($899/mo, $8,630/yr)
//   license       → white-label: limits set per-agency (override), defaults 25/15
//   founding      → legacy founding-agency grants: per-agency override, defaults 10/5
// Per-agency overrides (trial_settings.max_listings / max_agents) ALWAYS win —
// that's how the boss gives a specific founding agency 10 listings without
// changing the tier for everyone else.
export const TIER_LIMITS: Record<string, UsageLimits> = {
  free: { maxListings: 1, maxLeads: 5, maxDeals: 0, maxAgents: 0, maxStorageBytes: 0 },
  professional: { maxListings: 10, maxLeads: 500, maxDeals: 50, maxAgents: 5, maxStorageBytes: 10 * 1024 * 1024 * 1024 },
  enterprise: { maxListings: 25, maxLeads: 2000, maxDeals: 200, maxAgents: 15, maxStorageBytes: 50 * 1024 * 1024 * 1024 },
  license: { maxListings: 25, maxLeads: 5000, maxDeals: 1000, maxAgents: 25, maxStorageBytes: 100 * 1024 * 1024 * 1024 },
  founding: { maxListings: 10, maxLeads: 500, maxDeals: 50, maxAgents: 5, maxStorageBytes: 10 * 1024 * 1024 * 1024 },
}

// --- Default limits (trial / no subscription) -------------------------------
export const DEFAULT_LIMITS: UsageLimits = TIER_LIMITS.free


/** Load current usage counters for the agency. */
export async function getAgencyUsage(agencyId: string): Promise<AgencyUsage> {
  const { data } = await supabase
    .from('agency_usage')
    .select('listings_used, leads_used, deals_used, storage_used')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return { listingsUsed: 0, leadsUsed: 0, dealsUsed: 0, storageUsedBytes: 0, agentsUsed: 0 }
  return {
    listingsUsed: data.listings_used || 0,
    leadsUsed: data.leads_used || 0,
    dealsUsed: data.deals_used || 0,
    storageUsedBytes: data.storage_used || 0,
    agentsUsed: 0, // resolved from agency_members count in usage bump route
  }
}

/** Is the user allowed to do `count = 1` more of a feature key? */
export function checkUsageLimits(usage: AgencyUsage, limits: UsageLimits, state: TrialState, key: FeatureKey): { allowed: boolean; reason?: string } {
  if (state.status === 'grace' || state.status === 'expired' || state.status === 'locked') {
    return { allowed: false, reason: 'Your trial has ended. Upgrade to continue creating.' }
  }
  // Paid plans have tier limits (not unlimited). Resolve by plan type.
  const effective = state.isPaid && state.planType ? (TIER_LIMITS[state.planType] || limits) : limits
  switch (key) {
    case 'listings': return usage.listingsUsed < effective.maxListings ? { allowed: true } : { allowed: false, reason: `Your plan allows ${effective.maxListings} listings. Upgrade for more.` }
    case 'leads': return usage.leadsUsed < effective.maxLeads ? { allowed: true } : { allowed: false, reason: `Your plan allows ${effective.maxLeads} leads. Upgrade for more.` }
    case 'deals': return effective.maxDeals > 0 && usage.dealsUsed < effective.maxDeals ? { allowed: true } : { allowed: false, reason: effective.maxDeals === 0 ? 'Deal pipeline is part of the CRM platform license.' : `Your plan allows ${effective.maxDeals} deals.` }
    case 'agents': return usage.agentsUsed < effective.maxAgents ? { allowed: true } : { allowed: false, reason: `Your plan allows ${effective.maxAgents} agents. Upgrade for more.` }
    case 'storage': return usage.storageUsedBytes < effective.maxStorageBytes ? { allowed: true } : { allowed: false, reason: 'Storage limit reached. Upgrade for more.' }
    default: return { allowed: true }
  }
}


/**
 * Gate a page/action in a read-only block. Used for the grace/locked read-only
 * mode: callers check `enforceLimits` and, if blocked, render a read-only view
 * instead of allowing creates.
 */
export function enforceLimits(state: TrialState): { blocked: boolean; mode: 'normal' | 'read_only' | 'locked'; reason?: string } {
  if (state.isPaid) return { blocked: false, mode: 'normal' }
  if (state.status === 'grace') return { blocked: true, mode: 'read_only', reason: `Your trial ended. You're in a read-only grace period until ${state.graceEnd ? new Date(state.graceEnd).toLocaleDateString() : 'soon'}. Upgrade to keep creating.` }
  if (state.status === 'expired') return { blocked: true, mode: 'read_only', reason: 'Your trial has ended. Data is preserved — upgrade to create again.' }
  if (state.status === 'locked') return { blocked: true, mode: 'locked', reason: 'Your account is locked. Contact us to restore access.' }
  return { blocked: false, mode: 'normal' }
}
