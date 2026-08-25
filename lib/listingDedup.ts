// =============================================================================
// listingDedup — client wrapper around the pure dedup core. Fetches the
// agency's existing listings and finds likely twins for the intake input
// BEFORE a new listing is created.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import {
  findListingDuplicates,
  scoreCandidate,
  normalizeBusinessName,
  nameTokenSimilarity,
  type DedupInput,
  type ListingCandidate,
  type ListingMatch,
} from '@/lib/listingDedupCore.ts'

export {
  findListingDuplicates,
  scoreCandidate,
  normalizeBusinessName,
  nameTokenSimilarity,
}
export type { DedupInput, ListingCandidate, ListingMatch } from '@/lib/listingDedupCore.ts'

/** Fetch candidate listings for dedup (all statuses, newest first). */
export async function fetchListingCandidates(limit = 500): Promise<ListingCandidate[]> {
  try {
    const { data, error } = await supabase
      .from('listings')
      .select('id, listing_ref, business_name, industry, location_general, asking_price, status')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return (data as ListingCandidate[]).map((r) => ({
      id: r.id,
      listing_ref: r.listing_ref ?? null,
      business_name: r.business_name ?? null,
      industry: r.industry ?? null,
      location_general: r.location_general ?? null,
      asking_price: r.asking_price != null ? Number(r.asking_price) : null,
      status: r.status ?? null,
    }))
  } catch {
    return []
  }
}

/**
 * Check an intake input against existing listings. Returns matches sorted by
 * score. Empty when no likely twin exists. Never throws.
 */
export async function checkListingDuplicates(input: DedupInput): Promise<ListingMatch[]> {
  if (!input.business_name && !input.industry && !input.location_general) return []
  try {
    const candidates = await fetchListingCandidates()
    return findListingDuplicates(input, candidates)
  } catch {
    return []
  }
}
