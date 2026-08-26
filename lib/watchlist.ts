/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Buyer Watchlists & Deal Alerts
// -----------------------------------------------------------------------------
// Saved searches + bookmarks for buyers, plus an alert engine that fires the
// moment a newly approved listing matches a saved search. Alerts reuse the
// buyer_match_events table so the feed, the email queue, and the auto-match
// engine stay unified.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify } from './email'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export interface WatchlistCriteria {
  industries?: string[]
  locations?: string[]
  min_price?: number | null
  max_price?: number | null
  min_revenue?: number | null
  min_sde?: number | null
  keywords?: string[]
}

export interface WatchlistSearch {
  id: string
  agency_id: string
  buyer_profile_id: string
  name: string
  criteria: WatchlistCriteria
  notify_email: boolean
  active: boolean
  last_match_at: string | null
  created_at: string
}

export interface ListingForWatchlist {
  id: string
  agency_id: string
  business_name?: string | null
  industry: string | null
  sub_industry: string | null
  location_general: string | null
  asking_price: number | null
  annual_revenue: number | null
  sde: number | null
}

const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim()

function overlap(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || a.length === 0 || !b || b.length === 0) return false
  const set = new Set(a.map(norm).filter(Boolean))
  return b.some((x) => set.has(norm(x)))
}

/** Score a saved-search criteria object against a listing. Returns 0-100, or null when a hard requirement fails. */
export function scoreWatchlistCriteria(criteria: WatchlistCriteria, listing: ListingForWatchlist): number | null {
  const reasons: string[] = []
  let points = 0

  const listingInds = [listing.industry, listing.sub_industry].map(norm).filter(Boolean)

  // Industry fit (35) — hard requirement when the search specifies industries.
  if (criteria.industries && criteria.industries.length > 0 && listingInds.length > 0) {
    if (overlap(criteria.industries, listingInds)) {
      points += 35
      reasons.push('industry')
    } else {
      return null
    }
  }

  // Keyword match (10) — free-text bonus on business name/industry.
  if (criteria.keywords && criteria.keywords.length > 0) {
    const haystack = norm(listing.business_name) + ' ' + listingInds.join(' ')
    const hit = criteria.keywords.some((k) => norm(k) && haystack.includes(norm(k)))
    if (hit) {
      points += 10
      reasons.push('keywords')
    }
  }

  // Location fit (15)
  if (criteria.locations && criteria.locations.length > 0 && listing.location_general) {
    if (overlap(criteria.locations, [listing.location_general])) {
      points += 15
      reasons.push('location')
    }
  }

  // Price range (25) — hard requirement when specified.
  if (listing.asking_price != null) {
    if (criteria.max_price != null && listing.asking_price > criteria.max_price) return null
    if (criteria.min_price != null && listing.asking_price < criteria.min_price) return null
    points += 25
    reasons.push('price')
  }

  // Revenue (15)
  if (criteria.min_revenue != null && listing.annual_revenue != null) {
    if (listing.annual_revenue >= criteria.min_revenue) {
      points += 15
      reasons.push('revenue')
    }
  }

  // SDE (10)
  if (criteria.min_sde != null && listing.sde != null) {
    if (listing.sde >= criteria.min_sde) {
      points += 10
      reasons.push('sde')
    }
  }

  // Floor: only meaningful matches alert.
  if (points < 40) return null
  return points
}

/** Fetch all active, alert-enabled saved searches for an agency. */
export async function fetchActiveSearches(agencyId: string): Promise<WatchlistSearch[]> {
  if (!svc) return []
  const { data, error } = await svc
    .from('buyer_watchlist_searches')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('active', true)
    .eq('notify_email', true)
  if (error) return []
  return (data || []) as WatchlistSearch[]
}

/** Fetch a listing's alert-relevant fields. */
export async function fetchListingForWatchlist(listingId: string): Promise<ListingForWatchlist | null> {
  if (!svc) return null
  const { data, error } = await svc
    .from('listings')
    .select('id, agency_id, business_name, industry, sub_industry, location_general, asking_price, annual_revenue, sde')
    .eq('id', listingId)
    .maybeSingle()
  if (error || !data) return null
  return data as ListingForWatchlist
}

/** Fetch the buyer profile (email/name) a saved search belongs to. */
async function fetchBuyerProfile(profileId: string) {
  if (!svc) return null
  const { data } = await svc.from('buyer_search_profiles').select('id, agency_id, email, name').eq('id', profileId).maybeSingle()
  return data || null
}

/**
 * Run watchlist matching for a listing that just went live.
 * Inserts idempotent buyer_match_events (source=watchlist) and queues a
 * deal-alert email per matched search. Never throws — alerting degrades.
 */
export async function runWatchlistMatching(listingId: string): Promise<{ checked: number; matched: number }> {
  const listing = await fetchListingForWatchlist(listingId)
  if (!svc || !listing) return { checked: 0, matched: 0 }

  const searches = await fetchActiveSearches(listing.agency_id)
  let matched = 0

  for (const search of searches) {
    const score = scoreWatchlistCriteria(search.criteria || {}, listing)
    if (score == null) continue

    const profile = await fetchBuyerProfile(search.buyer_profile_id)
    if (!profile) continue

    // Idempotent per buyer+listing (unique constraint) — safe to re-run.
    const { error: insertError } = await svc.from('buyer_match_events').upsert(
      {
        agency_id: listing.agency_id,
        buyer_profile_id: search.buyer_profile_id,
        listing_id: listing.id,
        match_score: score,
        matched_on: { source: 'watchlist', search_id: search.id, search_name: search.name, reasons: [] },
        status: 'pending',
      },
      { onConflict: 'buyer_profile_id,listing_id' },
    )
    if (insertError) continue

    await svc
      .from('buyer_watchlist_searches')
      .update({ last_match_at: new Date().toISOString() })
      .eq('id', search.id)

    // Queue the alert email (SMTP when configured, otherwise queued).
    await notify('match_alert', profile.email, {
      name: profile.name || 'there',
      searchName: search.name,
      businessName: listing.business_name || 'a new business',
      price: listing.asking_price,
      listingId: listing.id,
      score,
    })
    matched++
  }

  return { checked: searches.length, matched }
}
