/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// marketMultiplesCore — pure, dependency-free industry multiple reference.
// Mirrors sql/market_multiples_schema.sql so the engine works offline and
// unit tests can import it directly. Lookup is fuzzy: token + alias match
// against the industry string (e.g. "Home Care Agency" → home care band).
// =============================================================================

export interface MarketBand {
  industry: string
  basis: 'SDE' | 'EBITDA'
  min: number
  max: number
  sourceNote?: string
}

const raw: [string, string[], 'SDE' | 'EBITDA', number, number, string?][] = [
  ['Home care', ['home health', 'homecare', 'care home', 'home care agency'], 'EBITDA', 4.0, 5.0, 'Home care franchises & agencies typically trade 4-5x EBITDA'],
  ['Home care', ['home health', 'homecare', 'care home', 'home care agency'], 'SDE', 2.5, 3.5, 'SDE band for smaller home care operators'],
  ['Restaurants', ['restaurant', 'food service', 'cafe', 'diner', 'bar', 'catering'], 'SDE', 1.8, 2.6, 'Independent restaurants trade ~2-3x SDE'],
  ['Auto repair', ['auto', 'mechanic', 'car repair', 'service center'], 'SDE', 2.0, 3.0, 'Auto repair / service shops'],
  ['Cleaning', ['janitorial', 'house cleaning', 'maid', 'commercial cleaning'], 'SDE', 2.0, 3.0, 'Cleaning & janitorial services'],
  ['Landscaping', ['lawn', 'landscape', 'snow removal'], 'SDE', 2.0, 3.2, 'Landscaping & lawn care'],
  ['Construction', ['contractor', 'trades', 'remodeling', 'roofing', 'hvac', 'plumbing', 'electrical'], 'SDE', 1.8, 2.8, 'Construction & trades'],
  ['Manufacturing', ['factory', 'production', 'fabrication', 'machine shop'], 'SDE', 2.5, 3.5, 'Light manufacturing'],
  ['Manufacturing', ['factory', 'production', 'fabrication', 'machine shop'], 'EBITDA', 4.0, 5.5, 'Manufacturers with clean books trade 4-5.5x EBITDA'],
  ['Distribution', ['wholesale', 'supply', 'import'], 'SDE', 2.2, 3.2, 'Distribution & wholesale'],
  ['Distribution', ['wholesale', 'supply', 'import'], 'EBITDA', 3.5, 4.5, 'Distribution with scale trades 3.5-4.5x EBITDA'],
  ['Retail', ['store', 'shop', 'boutique'], 'SDE', 1.8, 2.8, 'Retail stores'],
  ['E-commerce', ['online', 'dropshipping', 'amazon fba'], 'SDE', 2.0, 3.2, 'E-commerce businesses'],
  ['E-commerce', ['online', 'dropshipping', 'amazon fba'], 'EBITDA', 3.5, 5.0, 'E-commerce with traction trades 3.5-5x EBITDA'],
  ['Software / SaaS', ['software', 'saas', 'tech', 'it services', 'app'], 'SDE', 3.0, 4.5, 'Software & IT services'],
  ['Software / SaaS', ['software', 'saas', 'tech', 'it services', 'app'], 'EBITDA', 4.0, 6.5, 'SaaS typically trades 4-6.5x EBITDA'],
  ['Healthcare', ['medical', 'dental', 'clinic', 'doctor', 'chiropractic', 'physical therapy', 'pharmacy'], 'SDE', 3.0, 4.0, 'Medical, dental & clinic practices'],
  ['Healthcare', ['medical', 'dental', 'clinic', 'doctor', 'chiropractic', 'physical therapy', 'pharmacy'], 'EBITDA', 4.5, 6.0, 'Healthcare practices trade 4.5-6x EBITDA'],
  ['Salon / Barbershop', ['salon', 'barber', 'beauty', 'spa', 'nails'], 'SDE', 1.8, 2.8, 'Salons, barbershops & spas'],
  ['Laundromat', ['laundry', 'coin laundry'], 'SDE', 2.5, 3.5, 'Laundromats'],
  ['Car wash', ['carwash'], 'SDE', 2.5, 3.5, 'Car washes'],
  ['Self storage', ['storage unit', 'mini storage'], 'EBITDA', 5.0, 6.5, 'Self storage trades 5-6.5x EBITDA'],
  ['Trucking / Logistics', ['trucking', 'freight', 'delivery', 'transportation', 'courier'], 'SDE', 2.0, 3.0, 'Trucking & logistics'],
  ['Trucking / Logistics', ['trucking', 'freight', 'delivery', 'transportation', 'courier'], 'EBITDA', 3.0, 4.0, 'Logistics with fleet trades 3-4x EBITDA'],
  ['Pet services', ['pet', 'grooming', 'boarding', 'veterinary'], 'SDE', 2.4, 3.4, 'Pet care services'],
  ['Childcare', ['daycare', 'child care', 'preschool', 'learning center'], 'SDE', 2.5, 3.5, 'Childcare centers'],
  ['Childcare', ['daycare', 'child care', 'preschool', 'learning center'], 'EBITDA', 4.0, 5.0, 'Childcare with enrollment scale trades 4-5x EBITDA'],
  ['Gas station / C-Store', ['gas', 'convenience store', 'fuel', 'c-store'], 'SDE', 2.0, 3.0, 'Gas stations & convenience stores'],
  ['Gas station / C-Store', ['gas', 'convenience store', 'fuel', 'c-store'], 'EBITDA', 3.5, 4.5, 'Gas stations with fuel contracts trade 3.5-4.5x EBITDA'],
  ['Fitness / Gym', ['gym', 'fitness', 'crossfit', 'yoga', 'pilates'], 'SDE', 2.0, 3.0, 'Gyms & fitness studios'],
  ['Hotels / Motels', ['hotel', 'motel', 'inn', 'bed and breakfast', 'bnb'], 'EBITDA', 4.5, 6.5, 'Hotels & motels trade 4.5-6.5x EBITDA'],
  ['Hotels / Motels', ['hotel', 'motel', 'inn', 'bed and breakfast', 'bnb'], 'SDE', 2.5, 3.5, 'SDE band for smaller hospitality assets'],
  ['Warehouse / Industrial', ['warehouse', 'industrial', 'storage facility', 'distribution center'], 'EBITDA', 4.0, 5.5, 'Warehouses & industrial real estate trade 4-5.5x EBITDA'],
  ['Vending', ['vending machine', 'vending route', 'coin-op'], 'SDE', 2.5, 3.5, 'Vending routes trade 2.5-3.5x SDE'],
  ['Liquor store', ['liquor', 'beer wine', 'package store', 'spirits'], 'SDE', 2.0, 3.0, 'Liquor & package stores'],
  ['Bakery', ['bakery', 'baking', 'pastry', 'donut', 'doughnut'], 'SDE', 1.8, 2.6, 'Bakeries trade ~2-2.5x SDE'],
  ['Coffee shop', ['coffee', 'cafe', 'espresso'], 'SDE', 2.0, 3.0, 'Coffee shops trade 2-3x SDE'],
  ['Printing', ['print shop', 'printing', 'sign shop', 'copy'], 'SDE', 2.0, 3.0, 'Print & sign shops'],
  ['Funeral home', ['funeral', 'crematory', 'mortuary'], 'SDE', 2.5, 3.5, 'Funeral homes trade 2.5-3.5x SDE'],
  ['Funeral home', ['funeral', 'crematory', 'mortuary'], 'EBITDA', 4.0, 5.0, 'Funeral homes with scale trade 4-5x EBITDA'],
  ['Franchise', ['franchise', 'franchisee', 'franchisor'], 'SDE', 2.5, 3.5, 'Franchise businesses trade 2.5-3.5x SDE'],
  ['Staffing', ['staffing', 'recruiting', 'employment agency', 'temp agency'], 'EBITDA', 3.5, 5.0, 'Staffing firms trade 3.5-5x EBITDA'],
  ['Insurance agency', ['insurance', 'agency', 'brokerage', 'independent agent'], 'EBITDA', 3.5, 5.5, 'Insurance agencies trade 3.5-5.5x EBITDA'],
  ['Insurance agency', ['insurance', 'agency', 'brokerage', 'independent agent'], 'SDE', 2.5, 3.5, 'SDE band for smaller agencies'],
  ['Accounting / Bookkeeping', ['accounting', 'bookkeeping', 'cpa', 'tax prepar', 'payroll'], 'SDE', 2.0, 3.0, 'Accounting & bookkeeping practices'],
  ['Auto dealership', ['dealership', 'car dealer', 'used cars', 'auto sales'], 'SDE', 2.0, 3.0, 'Auto dealerships (asset-heavy)'],
  ['Marina', ['marina', 'boat slip', 'boatyard'], 'EBITDA', 5.0, 7.0, 'Marinas trade 5-7x EBITDA'],
  ['Golf course', ['golf', 'country club', 'driving range'], 'EBITDA', 4.0, 6.0, 'Golf courses trade 4-6x EBITDA'],
  ['Real estate brokerage', ['real estate', 'realtor', 'property management', 'title'], 'SDE', 2.0, 3.0, 'Real estate & property management firms'],
]

// Universal fallback — every business gets a defensible market band, even
// when the industry is unusual or brand new. This is what makes the system
// work for ANY M&A deal or side business, not just known industries.
export const DEFAULT_BAND: MarketBand = { industry: 'General small business', basis: 'SDE', min: 2.5, max: 3.5, sourceNote: 'Fallback band — typical range for an established small business' }
export const DEFAULT_EBITDA_BAND: MarketBand = { industry: 'General small business', basis: 'EBITDA', min: 3.5, max: 5.0, sourceNote: 'Fallback band — typical EBITDA range for an established small business' }

export const MARKET_MULTIPLES: MarketBand[] = raw.map(([industry, , basis, min, max, sourceNote]) => ({
  industry, basis, min, max, sourceNote,
}))

const ALIASES: Record<string, string[]> = {}
for (const [industry, aliases] of raw) {
  ALIASES[industry] = (ALIASES[industry] || []).concat(aliases)
}

const norm = (s: string | null | undefined): string => (s || '').toLowerCase().trim()

/**
 * Best-effort industry match → canonical industry label, or null.
 * Token overlap beats substring so "home care agency" still lands on
 * "Home care" and "restaurant" on "Restaurants".
 */
export function matchIndustry(industry: string | null | undefined): string | null {
  const i = norm(industry)
  if (!i) return null

  // Exact / alias / substring matches first.
  for (const [label, aliases] of Object.entries(ALIASES)) {
    if (i === norm(label)) return label
    if (aliases.some((a) => i === norm(a))) return label
  }
  // Substring matches — most specific (longest) match wins so a
  // "convenience store with gas" lands on Gas station / C-Store, not Retail.
  let bestSub: { label: string; len: number } | null = null
  for (const [label, aliases] of Object.entries(ALIASES)) {
    const cands = [norm(label), ...aliases.map(norm)].filter(Boolean)
    for (const c of cands) {
      if (i.includes(c) && (!bestSub || c.length > bestSub.len)) bestSub = { label, len: c.length }
    }
  }
  if (bestSub) return bestSub.label

  // Token overlap (≥2 tokens or full overlap of a multi-word alias).
  const tokens = i.split(/[^a-z0-9]+/).filter((t) => t.length > 1)
  let best: { label: string; score: number } | null = null
  for (const [label, aliases] of Object.entries(ALIASES)) {
    const labelTokens = norm(label).split(/[^a-z0-9]+/).filter((t) => t.length > 1)
    const hit = labelTokens.filter((t) => tokens.includes(t)).length
    const aliasHits = aliases
      .map((a) => {
        const at = norm(a).split(/[^a-z0-9]+/).filter((t) => t.length > 1)
        return at.filter((t) => tokens.includes(t)).length / Math.max(1, at.length)
      })
      .reduce((m, x) => Math.max(m, x), 0)
    const score = hit + aliasHits
    if (score > 0 && (!best || score > best.score)) best = { label, score }
  }
  return best ? best.label : null
}

/** All bands for an industry (both bases), or null when unknown. */
export function bandsForIndustry(industry: string | null | undefined): MarketBand[] | null {
  const label = matchIndustry(industry)
  if (!label) return null
  return MARKET_MULTIPLES.filter((b) => b.industry === label)
}

/** Preferred band: EBITDA when the business reports EBITDA, else SDE. */
export function bandForIndustry(
  industry: string | null | undefined,
  preferBasis?: 'SDE' | 'EBITDA'
): MarketBand {
  const bands = bandsForIndustry(industry)
  if (bands && bands.length > 0) {
    if (preferBasis) {
      const match = bands.find((b) => b.basis === preferBasis)
      if (match) return match
    }
    const ebitda = bands.find((b) => b.basis === 'EBITDA')
    if (ebitda) return ebitda
    return bands[0]
  }
  // Universal fallback: unknown industries still get a defensible band so
  // valuation, marketing docs and the website always have a market read.
  return preferBasis === 'EBITDA' ? DEFAULT_EBITDA_BAND : DEFAULT_BAND
}
