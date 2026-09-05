/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// UNIFIED BUYER POOL
// -----------------------------------------------------------------------------
// Merges every buyer signal an agency can see into ONE deduplicated list:
//   1. buyer_leads               — CRM leads (agency-scoped)
//   2. buyer_search_profiles     — marketplace profiles linked to this agency
//      (watchlist searches carry agency_id + buyer_profile_id)
//   3. buyer_watchlist_searches  — saved searches per buyer profile
// Buyers are keyed by normalized email (lowercase, trimmed). A buyer appearing
// in multiple pools is merged into one row with per-source flags so brokers see
// the full picture instead of three disconnected lists.
// Read-only, agency-scoped — never emails anyone.
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'

export interface PooledBuyer {
  email: string
  name: string | null
  phone: string | null
  company: string | null
  /** Which universes this buyer appears in. */
  sources: {
    crm: boolean
    profile: boolean
    watchlist: boolean
  }
  /** Aggregated interest from all sources (industries / types). */
  industries: string[]
  locations: string[]
  budget_range: string | null
  min_price: number | null
  max_price: number | null
  status: string | null
  verified_buyer: boolean
  crm_listing_id: string | null
  watchlist_names: string[]
  last_active_at: string | null
  created_at: string | null
}

const normEmail = (e: string | null | undefined) => (e || '').trim().toLowerCase()

/**
 * Load the agency's unified buyer pool. Never throws — returns [] on failure.
 * Results sorted by most recent activity first.
 */
export async function loadUnifiedBuyerPool(agencyId: string): Promise<PooledBuyer[]> {
  const db = createServerClient()
  if (!db || !agencyId) return []

  const map = new Map<string, PooledBuyer>()
  const upsert = (email: string, patch: (b: PooledBuyer) => void) => {
    const key = normEmail(email)
    if (!key) return
    let b = map.get(key)
    if (!b) {
      b = {
        email: key,
        name: null,
        phone: null,
        company: null,
        sources: { crm: false, profile: false, watchlist: false },
        industries: [],
        locations: [],
        budget_range: null,
        min_price: null,
        max_price: null,
        status: null,
        verified_buyer: false,
        crm_listing_id: null,
        watchlist_names: [],
        last_active_at: null,
        created_at: null,
      }
      map.set(key, b)
    }
    patch(b)
  }
  const uniq = (arr: (string | null | undefined)[]) => Array.from(new Set(arr.filter((x): x is string => !!x && x.trim() !== '')))

  // 1) CRM leads
  const { data: leads } = await db
    .from('buyer_leads')
    .select('id, email, contact_name, full_name, company, phone, status, listing_id, verified_buyer, industry_interest, desired_business_type, budget_range, created_at')
    .eq('agency_id', agencyId)
    .limit(1000)
  for (const r of (leads || []) as Record<string, unknown>[]) {
    upsert(r.email as string, (b) => {
      b.sources.crm = true
      b.name = b.name || (r.full_name as string) || (r.contact_name as string) || null
      b.company = b.company || (r.company as string) || null
      b.phone = b.phone || (r.phone as string) || null
      b.status = b.status || (r.status as string) || null
      b.verified_buyer = b.verified_buyer || !!r.verified_buyer
      b.crm_listing_id = b.crm_listing_id || (r.listing_id as string) || null
      b.budget_range = b.budget_range || (r.budget_range as string) || null
      b.industries = uniq([...b.industries, r.industry_interest as string, r.desired_business_type as string])
      if (r.created_at) {
        if (!b.created_at || String(r.created_at) > b.created_at) b.created_at = r.created_at as string
        if (!b.last_active_at || String(r.created_at) > b.last_active_at) b.last_active_at = r.created_at as string
      }
    })
  }

  // 2) Marketplace profiles + their watchlist searches (agency-scoped)
  const { data: watches } = await db
    .from('buyer_watchlist_searches')
    .select('name, criteria, buyer_search_profiles(id, email, name, industries, locations, min_price, max_price, created_at)')
    .eq('agency_id', agencyId)
    .eq('active', true)
    .limit(500)
  for (const w of (watches || []) as Record<string, unknown>[]) {
    const profile = (w.buyer_search_profiles || {}) as Record<string, unknown>
    const email = (profile.email as string) || (w.email as string) || ''
    upsert(email, (b) => {
      b.sources.profile = true
      b.sources.watchlist = true
      b.name = b.name || (profile.name as string) || null
      b.industries = uniq([...b.industries, ...(((profile.industries as string[]) || []))])
      b.locations = uniq([...b.locations, ...(((profile.locations as string[]) || []))])
      b.min_price = b.min_price ?? ((profile.min_price as number | null) ?? null)
      b.max_price = b.max_price ?? ((profile.max_price as number | null) ?? null)
      if (w.name) b.watchlist_names = uniq([...b.watchlist_names, w.name as string])
      if (profile.created_at) {
        if (!b.created_at || String(profile.created_at) > b.created_at) b.created_at = profile.created_at as string
        if (!b.last_active_at || String(profile.created_at) > b.last_active_at) b.last_active_at = profile.created_at as string
      }
    })
  }

  const pooled = Array.from(map.values())
  pooled.sort((a, b) => {
    const ta = a.last_active_at ? new Date(a.last_active_at).getTime() : 0
    const tb = b.last_active_at ? new Date(b.last_active_at).getTime() : 0
    return tb - ta
  })
  return pooled
}

export interface PoolSummary {
  total: number
  crmOnly: number
  marketplaceOnly: number
  inBoth: number
  verified: number
  activeWatchlists: number
}

export function summarizePool(pool: PooledBuyer[]): PoolSummary {
  const summary: PoolSummary = { total: pool.length, crmOnly: 0, marketplaceOnly: 0, inBoth: 0, verified: 0, activeWatchlists: 0 }
  for (const b of pool) {
    if (b.sources.crm && !b.sources.profile && !b.sources.watchlist) summary.crmOnly++
    else if (!b.sources.crm && (b.sources.profile || b.sources.watchlist)) summary.marketplaceOnly++
    else if (b.sources.crm && (b.sources.profile || b.sources.watchlist)) summary.inBoth++
    if (b.verified_buyer) summary.verified++
    if (b.watchlist_names.length) summary.activeWatchlists++
  }
  return summary
}
