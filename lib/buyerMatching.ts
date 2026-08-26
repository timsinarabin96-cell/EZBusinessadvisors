/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Buyer Match Engine
// -----------------------------------------------------------------------------
// Scores active buyer search profiles against a newly published listing and
// records match events, so the notification layer (email/SMS) can fire the
// moment a qualifying business goes live.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface BuyerProfile {
  id: string
  agency_id: string
  email: string
  name: string | null
  industries: string[]
  locations: string[]
  min_price: number | null
  max_price: number | null
  min_revenue: number | null
  min_sde: number | null
  notification_email: boolean
  notification_sms: boolean
  ai_match_enabled: boolean
  active: boolean
}

export interface ListingMatchInput {
  id: string
  agency_id: string
  industry: string | null
  sub_industry: string | null
  location_general: string | null
  asking_price: number | null
  annual_revenue: number | null
  sde: number | null
}

export interface MatchResult {
  buyer_profile_id: string
  listing_id: string
  agency_id: string
  match_score: number
  matched_on: Record<string, unknown>
}

const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim()

function overlap(a: string[], b: string[]): boolean {
  const set = new Set(a.map(norm).filter(Boolean))
  return b.some((x) => set.has(norm(x)))
}

/** Score a buyer profile against a listing. Returns 0-100. */
export function scoreMatch(buyer: BuyerProfile, listing: ListingMatchInput): MatchResult | null {
  const reasons: string[] = []
  let points = 0

  // Industry fit (35 pts) — profile industries must overlap listing industry/sub_industry
  const listingInds = [listing.industry, listing.sub_industry].map(norm).filter(Boolean)
  if (buyer.industries.length > 0 && listingInds.length > 0) {
    if (overlap(buyer.industries, listingInds)) {
      points += 35
      reasons.push('industry')
    } else {
      return null // hard requirement
    }
  }

  // Location fit (15 pts)
  if (buyer.locations.length > 0 && listing.location_general) {
    if (overlap(buyer.locations, [listing.location_general])) {
      points += 15
      reasons.push('location')
    }
  }

  // Price range (25 pts)
  if (listing.asking_price != null) {
    if (buyer.max_price != null && listing.asking_price > buyer.max_price) {
      return null // over budget
    }
    if (buyer.min_price != null && listing.asking_price < buyer.min_price) {
      return null // below minimum interest
    }
    points += 25
    reasons.push('price')
  }

  // Revenue (15 pts)
  if (buyer.min_revenue != null && listing.annual_revenue != null) {
    if (listing.annual_revenue >= buyer.min_revenue) {
      points += 15
      reasons.push('revenue')
    }
  }

  // SDE (10 pts)
  if (buyer.min_sde != null && listing.sde != null) {
    if (listing.sde >= buyer.min_sde) {
      points += 10
      reasons.push('sde')
    }
  }

  // Floor: only meaningful matches notify
  if (points < 40) return null

  return {
    buyer_profile_id: buyer.id,
    listing_id: listing.id,
    agency_id: listing.agency_id,
    match_score: points,
    matched_on: { reasons, points },
  }
}

/** Fetch active buyer profiles for an agency. */
export async function fetchBuyerProfiles(agencyId: string): Promise<BuyerProfile[]> {
  if (!svc) return []
  const { data, error } = await svc
    .from('buyer_search_profiles')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('active', true)
    .eq('ai_match_enabled', true)
  if (error) return []
  return (data || []) as BuyerProfile[]
}

/** Fetch a listing's match-relevant fields. */
export async function fetchListingForMatch(listingId: string): Promise<ListingMatchInput | null> {
  if (!svc) return null
  const { data, error } = await svc
    .from('listings')
    .select('id, agency_id, industry, sub_industry, location_general, asking_price, annual_revenue, sde')
    .eq('id', listingId)
    .maybeSingle()
  if (error || !data) return null
  return data as ListingMatchInput
}

/** Run matching for a listing; insert match events (idempotent per buyer+listing). */
export async function runMatchingForListing(listingId: string): Promise<MatchResult[]> {
  if (!svc) return []
  const listing = await fetchListingForMatch(listingId)
  if (!listing || !listing.agency_id) return []

  const buyers = await fetchBuyerProfiles(listing.agency_id)
  const results: MatchResult[] = []
  for (const buyer of buyers) {
    const match = scoreMatch(buyer, listing)
    if (match) results.push(match)
  }

  if (results.length > 0) {
    const { error } = await svc.from('buyer_match_events').upsert(results, {
      onConflict: 'buyer_profile_id,listing_id',
    })
    if (error) throw new Error(error.message)
  }
  return results
}

/** Count pending (not yet notified) matches for a buyer profile. */
export async function countPendingMatches(buyerProfileId: string): Promise<number> {
  if (!svc) return 0
  const { count, error } = await svc
    .from('buyer_match_events')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_profile_id', buyerProfileId)
    .eq('status', 'pending')
  if (error) return 0
  return count || 0
}
