// =============================================================================
// Financing Marketplace — loan-readiness + lender matching
// -----------------------------------------------------------------------------
// Wraps the pure readiness engine (financingCore.mts) with real data:
//  - load a listing's financials → loan-readiness assessment + package checklist
//  - match SBA/lender professionals from the deal_professionals directory
//  - public hub page data (lender count, funding stats)
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { assessLoanReadiness, type FinancingAssessment, type FinancingInput } from '@/lib/financingCore.mts'
import { fetchPublicProfessionals, type DealProfessional } from '@/lib/professionals'

export { assessLoanReadiness, type FinancingAssessment, type FinancingInput }

export interface ListingFinancingSnapshot {
  listingId: string
  businessName: string | null
  askingPrice: number
  sde: number | null
  ebitda: number | null
  annualRevenue: number | null
  realEstateIncluded: boolean | null
  sellerFinancingAvailable: boolean | null
  establishedYear: number | null
  financialYears: number
}

/** Load a listing's financing-relevant snapshot. */
export async function loadFinancingSnapshot(listingId: string): Promise<ListingFinancingSnapshot | null> {
  const { data: listing } = await supabase
    .from('listings')
    .select('id, business_name, asking_price, sde, ebitda, annual_revenue, real_estate_included, seller_financing_available, established_year')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return null

  const { count } = await supabase
    .from('financial_history')
    .select('id', { count: 'exact', head: true })
    .eq('listing_id', listingId)

  const nowYear = new Date().getFullYear()
  return {
    listingId,
    businessName: listing.business_name || null,
    askingPrice: Number(listing.asking_price) || 0,
    sde: listing.sde != null ? Number(listing.sde) : null,
    ebitda: listing.ebitda != null ? Number(listing.ebitda) : null,
    annualRevenue: listing.annual_revenue != null ? Number(listing.annual_revenue) : null,
    realEstateIncluded: listing.real_estate_included ?? null,
    sellerFinancingAvailable: listing.seller_financing_available ?? null,
    establishedYear: listing.established_year ?? null,
    financialYears: count || 0,
  }
}

/** Full financing assessment for a listing (snapshot → readiness engine). */
export async function assessListingFinancing(listingId: string): Promise<{ snapshot: ListingFinancingSnapshot; assessment: FinancingAssessment } | null> {
  const snapshot = await loadFinancingSnapshot(listingId)
  if (!snapshot) return null
  const input: FinancingInput = {
    askingPrice: snapshot.askingPrice,
    sde: snapshot.sde,
    ebitda: snapshot.ebitda,
    annualRevenue: snapshot.annualRevenue,
    yearsOfFinancials: snapshot.financialYears,
    sellerFinancingAvailable: snapshot.sellerFinancingAvailable ?? undefined,
    realEstateIncluded: snapshot.realEstateIncluded ?? undefined,
    businessAgeYears: snapshot.establishedYear ? Math.max(1, new Date().getFullYear() - snapshot.establishedYear) : 0,
  }
  return { snapshot, assessment: assessLoanReadiness(input) }
}

/** Match lender professionals for a listing (industry/state aware). */
export async function matchLendersForListing(listingId: string, industry?: string | null, state?: string | null): Promise<DealProfessional[]> {
  const pros = await fetchPublicProfessionals({ type: 'lender' })
  const scored = pros
    .map((p) => {
      let score = 0
      if (p.specialty && /sba/i.test(p.specialty)) score += 3
      if (industry && p.industries.map((i) => i.toLowerCase()).includes(industry.toLowerCase())) score += 2
      if (state && p.states_served.map((s) => s.toUpperCase()).includes(state)) score += 2
      if (p.is_platform_verified) score += 1
      if (p.deals_closed && p.deals_closed >= 10) score += 1
      return { p, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored.map((s) => s.p)
}

/** Public hub stats: how many lenders are in the network. */
export async function fetchFinancingHubStats(): Promise<{ lenderCount: number; verifiedLenders: number }> {
  const pros = await fetchPublicProfessionals({ type: 'lender' })
  return {
    lenderCount: pros.length,
    verifiedLenders: pros.filter((p) => p.is_platform_verified).length,
  }
}
