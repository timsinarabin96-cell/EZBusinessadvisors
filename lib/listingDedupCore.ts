/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// listingDedupCore — pure, dependency-free duplicate-listing detection.
// Given the intake form and the agency's existing listings, finds likely
// twins BEFORE a new listing is created: normalized business-name match,
// industry+location+price proximity, and token overlap.
// Unit-testable without a database.
// =============================================================================

export interface ListingCandidate {
  id: string
  listing_ref?: string | null
  business_name?: string | null
  industry?: string | null
  location_general?: string | null
  asking_price?: number | null
  status?: string | null
}

export interface DedupInput {
  business_name?: string | null
  industry?: string | null
  location_general?: string | null
  asking_price?: number | null
}

export interface ListingMatch {
  candidate: ListingCandidate
  score: number // 0-100
  level: 'high' | 'medium' | 'low'
  reasons: string[]
}

/** Strip legal suffixes + punctuation, lowercase, collapse whitespace. */
export function normalizeBusinessName(name: string | null | undefined): string {
  return (name || '')
    .toLowerCase()
    .replace(/\b(llc|ltd|inc|corp|corporation|company|co|llp|pllc|group|enterprises?|holdings?|associates?|services?|solutions?)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Token overlap similarity 0..1 for two normalized names. */
export function nameTokenSimilarity(a: string, b: string): number {
  const ta = a.split(' ').filter(Boolean)
  const tb = b.split(' ').filter(Boolean)
  if (!ta.length || !tb.length) return 0
  const set = new Set(ta)
  const hits = tb.filter((t) => set.has(t) && t.length > 1).length
  return hits / Math.max(ta.length, tb.length)
}

const norm = (s: string | null | undefined): string => (s || '').toLowerCase().trim()

/**
 * Score a single candidate against the intake input.
 * Reasons are human-readable so the UI can explain WHY it's flagged.
 */
export function scoreCandidate(input: DedupInput, c: ListingCandidate): ListingMatch | null {
  const reasons: string[] = []
  const a = normalizeBusinessName(input.business_name)
  const b = normalizeBusinessName(c.business_name)
  let score = 0

  if (a && b) {
    if (a === b) {
      score += 55
      reasons.push('Same business name')
    } else {
      const sim = nameTokenSimilarity(a, b)
      if (sim >= 0.9) {
        score += 45
        reasons.push(`Name matches closely ("${c.business_name}")`)
      } else if (sim >= 0.6) {
        score += 25
        reasons.push(`Name overlaps ("${c.business_name}")`)
      }
    }
  }

  const sameIndustry = a && norm(input.industry) && norm(input.industry) === norm(c.industry)
  if (sameIndustry) {
    score += 15
    reasons.push(`Same industry (${c.industry})`)
  }

  const sameLocation = norm(input.location_general) && norm(input.location_general) === norm(c.location_general)
  if (sameLocation) {
    score += 15
    reasons.push(`Same location (${c.location_general})`)
  } else if (norm(input.location_general) && norm(c.location_general) && norm(input.location_general).includes(norm(c.location_general)) || norm(c.location_general)?.includes(norm(input.location_general) || '')) {
    score += 8
    reasons.push('Location overlaps')
  }

  if (input.asking_price && c.asking_price) {
    const ratio = Math.min(input.asking_price, c.asking_price) / Math.max(input.asking_price, c.asking_price)
    if (ratio >= 0.85) {
      score += 10
      reasons.push('Asking price within 15%')
    } else if (ratio >= 0.6) {
      score += 5
      reasons.push('Asking price in a similar range')
    }
  }

  const level: ListingMatch['level'] = score >= 65 ? 'high' : score >= 35 ? 'medium' : score >= 20 ? 'low' : null
  if (!level) return null
  return { candidate: c, score, level, reasons }
}

/** Find all candidate twins for the intake input, best first. */
export function findListingDuplicates(input: DedupInput, candidates: ListingCandidate[]): ListingMatch[] {
  if (!input.business_name && !input.industry && !input.location_general && !input.asking_price) return []
  return candidates
    .map((c) => scoreCandidate(input, c))
    .filter((m): m is ListingMatch => m !== null)
    .sort((a, b) => b.score - a.score)
}
