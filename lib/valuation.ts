// =============================================================================
// Seller Valuation Engine
// -----------------------------------------------------------------------------
// Range estimates for listings: SDE-multiple table (default 2.5-3.5x SDE)
// cross-checked against 0.8-1.2x annual revenue, with SBA-style adjustments
// (margin quality, industry). When the listing reports EBITDA and a market
// EBITDA band exists (market_multiples reference), the EBITDA band is used
// instead. Estimates and their inputs/multiples are stored as jsonb so the
// breakdown can be re-explained. Server-only. Never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { bandForIndustry } from '@/lib/marketMultiplesCore.ts'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// ---------------------------------------------------------------------------
// Industry multiple table (static; a sold-comps table can replace this later)
// ---------------------------------------------------------------------------
export interface IndustryMultiple {
  label: string
  min: number // x SDE
  max: number // x SDE
}

const INDUSTRY_MULTIPLES: Record<string, IndustryMultiple> = {
  'auto repair': { label: 'Auto repair / service', min: 2.0, max: 2.8 },
  'car wash': { label: 'Car wash', min: 2.5, max: 3.5 },
  'cleaning': { label: 'Cleaning / janitorial', min: 2.0, max: 2.8 },
  'construction': { label: 'Construction / trades', min: 1.8, max: 2.6 },
  'distribution': { label: 'Distribution / wholesale', min: 2.2, max: 3.0 },
  'ecommerce': { label: 'E-commerce', min: 2.0, max: 3.2 },
  'education': { label: 'Education / tutoring', min: 2.2, max: 3.2 },
  'food': { label: 'Food service', min: 1.8, max: 2.6 },
  'health': { label: 'Healthcare / wellness', min: 2.8, max: 4.0 },
  'landscaping': { label: 'Landscaping / lawn', min: 2.0, max: 2.8 },
  'laundromat': { label: 'Laundromat', min: 2.5, max: 3.5 },
  'logistics': { label: 'Logistics / trucking', min: 2.0, max: 2.8 },
  'manufacturing': { label: 'Manufacturing', min: 2.6, max: 3.6 },
  'marketing': { label: 'Marketing / agency', min: 2.2, max: 3.2 },
  'pet': { label: 'Pet services', min: 2.4, max: 3.4 },
  'retail': { label: 'Retail', min: 1.8, max: 2.6 },
  'salon': { label: 'Salon / barber', min: 2.0, max: 2.8 },
  'software': { label: 'Software / SaaS', min: 3.0, max: 4.5 },
  'storage': { label: 'Self storage', min: 3.0, max: 4.0 },
  'transportation': { label: 'Transportation', min: 2.0, max: 2.8 },
}

const DEFAULT_MULTIPLE: IndustryMultiple = { label: 'General small business', min: 2.5, max: 3.5 }

const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim()

/** Look up the multiple band for an industry string (substring match). */
export function multipleForIndustry(industry: string | null | undefined): IndustryMultiple {
  const i = norm(industry)
  if (!i) return DEFAULT_MULTIPLE
  const key = Object.keys(INDUSTRY_MULTIPLES).find((k) => i.includes(k))
  return key ? INDUSTRY_MULTIPLES[key] : DEFAULT_MULTIPLE
}

/** SBA-style margin adjustment: thin margins pull the multiple down, fat ones up. */
export function marginAdjustment(sde: number | null | undefined, revenue: number | null | undefined): number {
  if (!sde || !revenue || revenue <= 0) return 0
  const margin = sde / revenue
  if (margin >= 0.25) return 0.4
  if (margin >= 0.18) return 0.2
  if (margin >= 0.1) return 0
  if (margin >= 0.05) return -0.3
  return -0.5
}

export interface ValuationInputs {
  business_name: string | null
  industry: string | null
  annual_revenue: number | null
  sde: number | null
  ebitda?: number | null
  asking_price: number | null
}

export interface ValuationResult {
  id?: string
  listing_id: string
  agency_id: string
  estimate_min: number
  estimate_max: number
  midpoint: number
  method: string
  multiples: {
    industry: string
    sde: { min: number; max: number }
    revenue: { min: number; max: number }
    margin_adjustment: number
    market?: { industry: string; basis: string; min: number; max: number; source?: string | null } | null
  }
  inputs: ValuationInputs
}

/** Compute the estimate (pure, deterministic — unit-testable). */
export function computeValuation(listing: ValuationInputs & { id?: string }): Omit<ValuationResult, 'id'> | null {
  const sde = listing.sde ?? 0
  const revenue = listing.annual_revenue ?? 0
  const ebitda = listing.ebitda ?? 0
  if (sde <= 0 && revenue <= 0 && ebitda <= 0) return null

  // Market multiples first (e.g. home care trades 4-5x EBITDA); the static
  // table is the fallback when the industry isn't in the market reference.
  const market = bandForIndustry(listing.industry, ebitda > 0 ? 'EBITDA' : 'SDE')
  const band = market
    ? { label: market.industry, min: market.min, max: market.max }
    : multipleForIndustry(listing.industry)
  const marginAdj = marginAdjustment(sde, revenue)
  const minMult = Math.max(1.0, band.min + marginAdj)
  const maxMult = Math.max(1.1, band.max + marginAdj)

  // Earnings leg: EBITDA when the market band is EBITDA-based and we have
  // EBITDA, otherwise SDE.
  const earnings = ebitda > 0 && market?.basis === 'EBITDA' ? ebitda : sde
  const earningsMin = earnings * minMult
  const earningsMax = earnings * maxMult
  const revMin = revenue * 0.8
  const revMax = revenue * 1.2

  // Blend earnings-multiple with the revenue cross-check (50/50) so both
  // methods inform the range; a missing metric simply falls out of the average.
  let min = 0
  let max = 0
  let count = 0
  if (earnings > 0) {
    min += earningsMin
    max += earningsMax
    count++
  }
  if (revenue > 0) {
    min += revMin
    max += revMax
    count++
  }
  if (count === 0) return null
  min = Math.round(min / count)
  max = Math.round(max / count)
  if (max < min) {
    const t = max
    max = min
    min = t
  }

  const method = market
    ? `Market ${market.basis} multiple (${market.min.toFixed(1)}-${market.max.toFixed(1)}x ${market.basis}, ${market.industry}) cross-checked against 0.8-1.2x revenue`
    : 'SDE multiple (2.5-3.5x, industry-adjusted) cross-checked against 0.8-1.2x revenue'

  return {
    listing_id: listing.id || '',
    agency_id: '',
    estimate_min: min,
    estimate_max: max,
    midpoint: Math.round((min + max) / 2),
    method,
    multiples: {
      industry: band.label,
      sde: { min: minMult, max: maxMult },
      revenue: { min: 0.8, max: 1.2 },
      margin_adjustment: marginAdj,
      market: market ? { industry: market.industry, basis: market.basis, min: market.min, max: market.max, source: market.sourceNote || null } : null,
    },
    inputs: {
      business_name: listing.business_name,
      industry: listing.industry,
      annual_revenue: listing.annual_revenue,
      sde: listing.sde,
      asking_price: listing.asking_price,
    },
  }
}

/**
 * Estimate the value of a listing and persist the estimate row.
 * Never throws.
 */
export async function estimateValuation(listingId: string): Promise<{ ok: boolean; error?: string; estimate?: ValuationResult }> {
  try {
    if (!svc) return { ok: false, error: 'Database is not configured' }
    if (!listingId) return { ok: false, error: 'listingId is required' }

    const { data: listing } = await svc
      .from('listings')
      .select('id, agency_id, business_name, industry, annual_revenue, sde, ebitda, asking_price')
      .eq('id', listingId)
      .maybeSingle()
    if (!listing) return { ok: false, error: 'Listing not found' }
    const l = listing as Record<string, unknown> & { agency_id: string }
    if (!l.agency_id) return { ok: false, error: 'Listing is not linked to an agency' }

    const estimate = computeValuation({
      id: l.id as string,
      business_name: (l.business_name as string | null) ?? null,
      industry: (l.industry as string | null) ?? null,
      annual_revenue: (l.annual_revenue as number | null) ?? null,
      sde: (l.sde as number | null) ?? null,
      ebitda: (l.ebitda as number | null) ?? null,
      asking_price: (l.asking_price as number | null) ?? null,
    })
    if (!estimate) return { ok: false, error: 'Listing has neither SDE nor annual revenue — nothing to value' }

    const { data, error } = await svc
      .from('valuation_estimates')
      .insert({
        agency_id: l.agency_id,
        listing_id: listingId,
        estimate_min: estimate.estimate_min,
        estimate_max: estimate.estimate_max,
        midpoint: estimate.midpoint,
        method: estimate.method,
        multiples: estimate.multiples as unknown as Record<string, unknown>,
        inputs: estimate.inputs as unknown as Record<string, unknown>,
      })
      .select('*')
      .single()

    if (error) return { ok: false, error: error.message || 'Failed to save valuation estimate' }
    return { ok: true, estimate: data as unknown as ValuationResult }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Valuation failed' }
  }
}

/** List estimates for an agency, optionally for a single listing. */
export async function listValuations(agencyId: string, listingId?: string): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  let q = svc
    .from('valuation_estimates')
    .select('*, listings(business_name, industry, asking_price)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (listingId) q = q.eq('listing_id', listingId)
  const { data, error } = await q
  if (error) return []
  return (data || []) as Record<string, unknown>[]
}
