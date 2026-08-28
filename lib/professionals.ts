/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Professional Services Network — lawyers, CPAs, QoE agents, lenders, consultants
// -----------------------------------------------------------------------------
// Public directory of deal professionals that brokers add and vouch for.
// Advisory only — the platform never guarantees credentials; verify yourself.
// =============================================================================

import { supabase } from '@/lib/supabase/client'

export type ProfessionalType = 'lawyer' | 'accountant' | 'qoe_agent' | 'lender' | 'consultant'

export const PROFESSIONAL_TYPES: ProfessionalType[] = ['lawyer', 'accountant', 'qoe_agent', 'lender', 'consultant']

export const PROFESSIONAL_LABELS: Record<ProfessionalType, string> = {
  lawyer: 'Business Attorney',
  accountant: 'CPA / Accountant',
  qoe_agent: 'Quality-of-Earnings Agent',
  lender: 'SBA / Lender',
  consultant: 'Business Consultant',
}

export interface DealProfessional {
  id: string
  agency_id: string | null
  professional_type: ProfessionalType
  name: string
  firm: string | null
  title: string | null
  specialty: string | null
  industries: string[]
  states_served: string[]
  country_code: string
  license_number: string | null
  license_state: string | null
  license_verified: boolean
  years_experience: number | null
  deals_closed: number | null
  bio: string | null
  rates: string | null
  website: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  is_platform_verified: boolean
  created_at: string
  // Referral-fee contract (boss's model): lenders pay per-deal referral fees;
  // a professional is only advertised when they agreed to pay.
  pays_referral_fees?: boolean
  referral_fee_pct?: number | null
  referral_fee_terms?: string | null
  advertised?: boolean
  fee_agreement_at?: string | null
}

export interface ProfessionalFilters {
  type?: ProfessionalType | 'all'
  state?: string
  industry?: string
  query?: string
}

const BASE_SELECT =
  'id, agency_id, professional_type, name, firm, title, specialty, industries, states_served, country_code, license_number, license_state, license_verified, years_experience, deals_closed, bio, rates, website, email, phone, avatar_url, is_active, is_platform_verified, created_at'

// Referral-fee columns land with sql/professional_referral_fees.sql. Until that
// migration runs, extended selects would 400 — so fetch with the extended
// select and transparently fall back to the base select on missing columns.
const EXTENDED_SELECT = `${BASE_SELECT}, pays_referral_fees, referral_fee_pct, referral_fee_terms, advertised, fee_agreement_at`

export async function fetchProfessionalsWithFeeFields(
  build: (select: string) => PromiseLike<{ data: any[] | null; error: any }>,
): Promise<any[] | null> {
  const first = await build(EXTENDED_SELECT)
  if (!first.error) return first.data
  if (/pays_referral_fees|advertised|fee_agreement_at/.test(String(first.error.message))) {
    const fallback = await build(BASE_SELECT)
    return fallback.data
  }
  return first.data
}

/** Await a PostgREST builder into a { data, error } shape (typed). */
export async function resolveBuilder<T>(
  builder: Promise<{ data: T[] | null; error: any }>,
): Promise<{ data: T[] | null; error: any }> {
  return builder
}

function matchesQuery(p: DealProfessional, q: string): boolean {
  const needle = q.toLowerCase()
  return (
    p.name.toLowerCase().includes(needle) ||
    (p.firm || '').toLowerCase().includes(needle) ||
    (p.specialty || '').toLowerCase().includes(needle) ||
    (p.bio || '').toLowerCase().includes(needle)
  )
}

/** Public directory search — active professionals, filtered + ordered by relevance.
 *  Once the fee schema lands, only advertised pros are public; the fallback keeps
 *  the directory working pre-migration. */
export async function fetchPublicProfessionals(filters: ProfessionalFilters = {}): Promise<DealProfessional[]> {
  const data = await fetchProfessionalsWithFeeFields((select) =>
    supabase.from('deal_professionals').select(select).eq('is_active', true).then((r) => ({ data: r.data, error: r.error })),
  )
  let rows = (data || []) as DealProfessional[]

  // Post-migration: hide non-advertised professionals from the public feed.
  if (rows.length && 'advertised' in (rows[0] as any)) {
    rows = rows.filter((p: any) => p.advertised !== false)
  }
  if (filters.type && filters.type !== 'all') rows = rows.filter((p) => p.professional_type === filters.type)
  if (filters.state) rows = rows.filter((p) => p.states_served.includes(filters.state!.toUpperCase()))
  if (filters.industry) rows = rows.filter((p) => p.industries.includes(filters.industry!))
  rows.sort((a, b) => Number(b.is_platform_verified) - Number(a.is_platform_verified) || a.name.localeCompare(b.name))

  if (filters.query?.trim()) {
    const q = filters.query.trim()
    rows = rows.filter((p) => matchesQuery(p, q))
  }
  return rows
}

export async function fetchPublicProfessional(id: string): Promise<DealProfessional | null> {
  const { data } = await supabase
    .from('deal_professionals')
    .select(BASE_SELECT)
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()
  return (data as DealProfessional | null) || null
}

// ---------------------------------------------------------------------------
// Agency-side management (brokers add / vouch for professionals)
// ---------------------------------------------------------------------------

export async function fetchMyProfessionals(): Promise<DealProfessional[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const data = await fetchProfessionalsWithFeeFields((select) =>
    supabase.from('deal_professionals').select(select).order('created_at', { ascending: false }).then((r) => ({ data: r.data, error: r.error })),
  )
  return (data || []) as DealProfessional[]
}

export type ProfessionalInput = Partial<Omit<DealProfessional, 'id' | 'created_at'>> & {
  professional_type: ProfessionalType
  name: string
}

export async function createProfessional(input: ProfessionalInput): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }
  const { data, error } = await supabase
    .from('deal_professionals')
    .insert({ ...input, is_active: input.is_active ?? true })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id }
}

export async function updateProfessional(id: string, patch: Partial<DealProfessional>): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }
  const { error } = await supabase.from('deal_professionals').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteProfessional(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }
  const { error } = await supabase.from('deal_professionals').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Listing referral matcher — find professionals for a specific deal
// ---------------------------------------------------------------------------

export interface ListingContext {
  industry?: string | null
  sub_industry?: string | null
  location_general?: string | null
  country_code?: string | null
}

const INDUSTRY_MAP: Record<string, string[]> = {
  'Auto Repair': ['Auto Repair'],
  'Car Wash': ['Car Wash'],
  Laundromat: ['Laundromat'],
  Restaurant: ['Restaurant', 'Food', 'Cafe', 'Bar', 'Bakery', 'Pizza'],
  'Daycare / Preschool': ['Daycare', 'Childcare', 'Preschool'],
  'Beauty / Salon': ['Salon', 'Barber', 'Nail', 'Beauty', 'Spa'],
  'Fitness / Gym': ['Gym', 'Fitness', 'CrossFit'],
  'Gas Station': ['Gas Station', 'Convenience Store'],
  'Convenience Store': ['Convenience Store', 'Gas Station'],
  'Medical / Dental': ['Medical', 'Dental', 'Chiropractic', 'Pharmacy'],
  'Retail / E-commerce': ['Retail', 'E-commerce', 'Ecommerce', 'Online'],
  'Manufacturing': ['Manufacturing', 'Machining', 'Fabrication'],
  'Cleaning / Janitorial': ['Cleaning', 'Janitorial', 'Housekeeping'],
  'Landscaping': ['Landscaping', 'Lawn Care', 'Snow Removal'],
  Trucking: ['Trucking', 'Logistics', 'Freight'],
  'Warehouse / Storage': ['Warehouse', 'Storage', 'Self-Storage'],
  Hotel: ['Hotel', 'Motel', 'Lodging', 'Airbnb'],
  'Franchise': ['Franchise'],
  'Digital Marketing': ['Marketing', 'SEO', 'Agency'],
  'IT / Software': ['IT', 'Software', 'Tech', 'SaaS'],
}

/** Match professionals to a listing: industry overlap first, then geography. */
export async function matchProfessionalsForListing(listing: ListingContext, limit = 4): Promise<DealProfessional[]> {
  const industryKeys = listing.industry ? (INDUSTRY_MAP[listing.industry] || [listing.industry]) : []
  const subIndustry = listing.sub_industry || ''
  const country = (listing.country_code || 'US').toUpperCase()
  const state = extractStateFromLocation(listing.location_general)

  const all = await fetchPublicProfessionals()
  const scored = all
    .map((p) => {
      let score = 0
      // Industry match (strongest signal)
      const pIndustries = p.industries.map((i) => i.toLowerCase())
      if (industryKeys.some((k) => pIndustries.includes(k.toLowerCase()))) score += 4
      if (subIndustry && pIndustries.includes(subIndustry.toLowerCase())) score += 3
      if (p.specialty && listing.industry && p.specialty.toLowerCase().includes(listing.industry.toLowerCase())) score += 2
      // Geography
      if (p.country_code === country) score += 2
      if (state && p.states_served.map((s) => s.toUpperCase()).includes(state)) score += 3
      else if (!state && p.states_served.length === 0 && p.country_code === country) score += 1
      // Credibility
      if (p.is_platform_verified) score += 2
      if (p.license_verified) score += 1
      if (p.deals_closed && p.deals_closed >= 10) score += 1
      return { p, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p)

  // Fallback: verified pros in the same country when nothing matched.
  if (scored.length === 0) {
    return all
      .filter((p) => p.country_code === country && (p.is_platform_verified || p.license_verified))
      .slice(0, limit)
  }
  return scored
}

/** Extract a US state code from "City, ST" style location text. */
export function extractStateFromLocation(location: string | null | undefined): string | null {
  if (!location) return null
  const match = location.match(/\b([A-Za-z]{2})\b\s*$/)
  if (!match) return null
  const candidate = match[1].toUpperCase()
  return /^[A-Z]{2}$/.test(candidate) ? candidate : null
}
