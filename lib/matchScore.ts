// =============================================================================
// AI Match Score — zero-token buyer-fit engine
// -----------------------------------------------------------------------------
// Scores a public listing against a visitor's buyer profile (stored in the
// browser) using pure deterministic math — no LLM, $0 per score, instant.
// 0-100: industry fit, price fit, SDE floor, location, absentee/franchise
// preferences. Used on listing cards ("93% fit for you") and detail pages.
// =============================================================================

import type { PublicMarketplaceListing } from '@/lib/marketplace'
import type { BuyerProfile } from '@/lib/publicFavorites'

export interface MatchScoreResult {
  score: number
  reasons: string[]
  hasProfile: boolean
}

const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim()

function overlap(a: string[], b: string[]): boolean {
  const set = new Set(a.map(norm).filter(Boolean))
  return b.some((x) => set.has(norm(x)))
}

/** Score a listing against a buyer profile. Pure, deterministic, zero tokens. */
export function scoreListingMatch(listing: PublicMarketplaceListing, profile: BuyerProfile): MatchScoreResult {
  const reasons: string[] = []
  let points = 0
  const hasProfile = profile.industries.length > 0 || profile.max_price != null || profile.min_sde != null || profile.locations.length > 0

  // Industry fit (35) — hard requirement when the buyer specified industries.
  if (profile.industries.length > 0) {
    const listingInds = [listing.industry, listing.sub_industry].map(norm).filter(Boolean)
    if (overlap(profile.industries, listingInds)) {
      points += 35
      reasons.push('industry fits you')
    } else {
      return { score: 0, reasons: ['industry mismatch'], hasProfile }
    }
  }

  // Price fit (30) — hard requirement when a max is set.
  if (profile.max_price != null && listing.asking_price != null) {
    if (listing.asking_price <= profile.max_price) {
      points += 30
      reasons.push('within your budget')
    } else {
      return { score: 0, reasons: ['above your budget'], hasProfile }
    }
  }

  // SDE floor (20)
  if (profile.min_sde != null && listing.sde != null) {
    if (listing.sde >= profile.min_sde) {
      points += 20
      reasons.push('earnings meet your floor')
    }
  }

  // Location (15)
  if (profile.locations.length > 0 && listing.location_general) {
    if (overlap(profile.locations, [listing.location_general])) {
      points += 15
      reasons.push('in your target area')
    }
  }

  // Absentee preference (bonus)
  if (profile.absentee_preferred && listing.is_absentee_owner === true) {
    points += 10
    reasons.push('absentee-friendly')
  }

  // Franchise preference (bonus for openness, penalty for dislike)
  if (listing.is_franchise === true) {
    if (profile.franchise_ok === false) {
      points -= 10
      reasons.push('franchise model')
    } else {
      points += 5
      reasons.push('franchise opportunity')
    }
  }

  return { score: Math.max(0, Math.min(100, points)), reasons, hasProfile }
}

/** Human label for the score band. */
export function matchBand(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Excellent fit', color: '#15803d' }
  if (score >= 60) return { label: 'Good fit', color: '#0e7490' }
  if (score >= 40) return { label: 'Possible fit', color: '#b45309' }
  return { label: 'Weak fit', color: '#b91c1c' }
}
