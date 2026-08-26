// =============================================================================
// Public marketplace helpers. Public listing data must only come from the
// allowlisted get_public_listing_feed RPC; never query the private listings
// table from a public route or browser component.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { publicListingSorter, type PublicListingSortBy } from '@/lib/publicListingSort'

export interface PublicMarketplaceListing {
  id: string
  slug: string | null
  public_title: string
  public_summary: string | null
  industry: string | null
  sub_industry: string | null
  location_general: string | null
  asking_price: number | null
  annual_revenue: number | null
  sde: number | null
  ebitda: number | null
  public_highlights: string[]
  gallery_urls: string[]
  is_featured: boolean
  is_confidential: boolean
  published_at: string | null
  show_financials: boolean
  broker_id?: string | null
  listing_ref?: string | null
  agent_name?: string | null
  agent_title?: string | null
  agent_photo?: string | null
  agent_phone?: string | null
  agent_email?: string | null
  is_absentee_owner?: boolean | null
  is_franchise?: boolean | null
  is_relocatable?: boolean | null
  seller_financing_available?: boolean | null
  established_year?: number | null
  employees_full_time?: number | null
  country_code?: string | null
  currency_code?: string | null
  revenue_verified?: boolean
  vetted?: boolean
  status?: string | null
  sba_qualified?: boolean | null
  views_total?: number | null
  views_7d?: number | null
}

interface PublicListingFeedRow {
  listing_id: string
  slug: string | null
  public_title: string | null
  public_summary: string | null
  industry: string | null
  sub_industry: string | null
  location_general: string | null
  asking_price: number | string | null
  annual_revenue: number | string | null
  sde: number | string | null
  ebitda: number | string | null
  public_highlights: unknown
  gallery_json: unknown
  is_featured: boolean | null
  is_confidential: boolean | null
  published_at: string | null
  show_financials: boolean | null
  vetted?: boolean | null
  status?: string | null
  broker_id?: string | null
  listing_ref?: string | null
  agent_name?: string | null
  agent_title?: string | null
  agent_photo?: string | null
  agent_phone?: string | null
  agent_email?: string | null
  sba_qualified?: boolean | null
  views_total?: number | null
  views_7d?: number | null
  is_absentee_owner?: boolean | null
  is_franchise?: boolean | null
  is_relocatable?: boolean | null
  seller_financing_available?: boolean | null
  established_year?: number | null
  employees_full_time?: number | null
  country_code?: string | null
  currency_code?: string | null
  revenue_verified?: boolean | null
}

export interface MarketplaceStats {
  totalListings: number
  avgAsking: number
  totalBusinessesSold: number
  industries: number
}

export interface SearchFilters {
  query?: string
  industry?: string
  location?: string
  minPrice?: number
  maxPrice?: number
  maxRevenue?: number
  minRevenue?: number
  maxSdeMultiple?: number
  absenteeOnly?: boolean
  franchiseOnly?: boolean
  financingAvailable?: boolean
  relocatableOnly?: boolean
  minEmployees?: number
  sbaOnly?: boolean
  status?: 'active' | 'under_contract' | 'sold'
  country?: string
  /** sort order for results: default = featured-first, then newest */
  sortBy?: PublicListingSortBy
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  for (const key of ['images', 'gallery', 'urls']) {
    if (Array.isArray(record[key])) {
      return record[key].filter((item): item is string => typeof item === 'string' && item.length > 0)
    }
  }
  return []
}

export function normalizePublicListing(row: PublicListingFeedRow): PublicMarketplaceListing {
  return {
    id: row.listing_id,
    slug: row.slug,
    public_title: row.public_title || 'Confidential Business Opportunity',
    public_summary: row.public_summary,
    industry: row.industry,
    sub_industry: row.sub_industry,
    location_general: row.location_general,
    asking_price: numberOrNull(row.asking_price),
    annual_revenue: numberOrNull(row.annual_revenue),
    sde: numberOrNull(row.sde),
    ebitda: numberOrNull(row.ebitda),
    public_highlights: stringArray(row.public_highlights),
    gallery_urls: stringArray(row.gallery_json),
    is_featured: Boolean(row.is_featured),
    is_confidential: row.is_confidential !== false,
    published_at: row.published_at,
    show_financials: Boolean(row.show_financials),
    broker_id: row.broker_id || null,
    listing_ref: row.listing_ref || null,
    agent_name: row.agent_name || null,
    agent_title: row.agent_title || null,
    agent_photo: row.agent_photo || null,
    agent_phone: row.agent_phone || null,
    agent_email: row.agent_email || null,
    is_absentee_owner: row.is_absentee_owner ?? null,
    is_franchise: row.is_franchise ?? null,
    is_relocatable: row.is_relocatable ?? null,
    seller_financing_available: row.seller_financing_available ?? null,
    established_year: row.established_year ?? null,
    employees_full_time: row.employees_full_time ?? null,
    country_code: row.country_code || null,
    currency_code: row.currency_code || 'USD',
    revenue_verified: Boolean(row.revenue_verified),
    vetted: Boolean(row.vetted),
    status: row.status || null,
    sba_qualified: row.sba_qualified ?? null,
    views_total: row.views_total != null ? Number(row.views_total) : null,
    views_7d: row.views_7d != null ? Number(row.views_7d) : null,
  }
}

export async function fetchPublicFeed(identifier: string | null = null, agency: string | null = null): Promise<PublicMarketplaceListing[]> {
  const { data, error } = await supabase.rpc('get_public_listing_feed', { p_slug: identifier, p_agency: agency })
  if (error) {
    console.error('get_public_listing_feed error:', error)
    return []
  }
  return ((data || []) as PublicListingFeedRow[]).map(normalizePublicListing)
}

export async function fetchPublicListing(identifier: string): Promise<PublicMarketplaceListing | null> {
  const listings = await fetchPublicFeed(identifier)
  return listings[0] || null
}

export async function fetchMarketplaceStats(agency: string | null = null): Promise<MarketplaceStats> {
  const [listings, sold] = await Promise.all([fetchPublicFeed(null, agency), fetchSoldListings(agency)])
  const prices = listings.map((listing) => listing.asking_price).filter((price): price is number => price !== null)
  const industries = new Set(listings.map((listing) => listing.industry).filter(Boolean)).size

  return {
    totalListings: listings.length,
    avgAsking: prices.length ? Math.round(prices.reduce((total, price) => total + price, 0) / prices.length) : 0,
    totalBusinessesSold: sold.length,
    industries,
  }
}

export async function searchPublicListings(filters: SearchFilters = {}, agency: string | null = null): Promise<PublicMarketplaceListing[]> {
  const query = filters.query?.trim().toLowerCase()
  const industry = filters.industry?.trim().toLowerCase()
  const location = filters.location?.trim().toLowerCase()
  const country = filters.country?.trim().toUpperCase()

  return (await fetchPublicFeed(null, agency))
    .filter((listing) => !country || (listing.country_code || 'US').toUpperCase() === country)
    .filter((listing) => !location || listing.location_general?.toLowerCase().includes(location))
    .filter((listing) => !filters.minPrice || (listing.asking_price !== null && listing.asking_price >= filters.minPrice))
    .filter((listing) => !filters.maxPrice || (listing.asking_price !== null && listing.asking_price <= filters.maxPrice))
    .filter((listing) => !filters.minRevenue || (listing.annual_revenue !== null && listing.annual_revenue >= filters.minRevenue))
    .filter((listing) => !filters.maxRevenue || (listing.annual_revenue !== null && listing.annual_revenue <= filters.maxRevenue))
    .filter((listing) => {
      if (!filters.maxSdeMultiple || listing.asking_price === null || listing.sde === null || listing.sde === 0) return true
      return listing.asking_price / listing.sde <= filters.maxSdeMultiple
    })
    .filter((listing) => !filters.absenteeOnly || listing.is_absentee_owner === true)
    .filter((listing) => !filters.franchiseOnly || listing.is_franchise === true)
    .filter((listing) => !filters.financingAvailable || listing.seller_financing_available === true)
    .filter((listing) => !filters.relocatableOnly || listing.is_relocatable === true)
    .filter((listing) => !filters.minEmployees || (listing.employees_full_time != null && listing.employees_full_time >= filters.minEmployees))
    .filter((listing) => !filters.sbaOnly || listing.sba_qualified === true)
    .filter((listing) => !filters.status || listing.status === filters.status)
    .filter((listing) => {
      if (!query) return true
      return [listing.public_title, listing.public_summary, listing.industry, listing.sub_industry, listing.listing_ref]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    })
    .slice(0, 200)
    .sort(publicListingSorter(filters.sortBy))
    .slice(0, 100)
}

/**
 * Pure sort comparator for public listings — lives in lib/publicListingSort.ts
 * (dependency-free, unit-testable). Re-exported here for convenience.
 */
export { publicListingSorter }

export async function fetchFeaturedListings(limit = 6, agency: string | null = null): Promise<PublicMarketplaceListing[]> {
  return (await fetchPublicFeed(null, agency))
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
    .slice(0, limit)
}

export async function fetchAllIndustries(agency: string | null = null): Promise<string[]> {
  const unique = new Set((await fetchPublicFeed(null, agency)).map((listing) => listing.industry).filter((value): value is string => Boolean(value)))
  return Array.from(unique).sort()
}

export interface PublicBroker {
  id: string
  profile_id: string | null
  agency_id: string | null
  public_name: string
  title: string
  bio: string
  avatar_url: string
  phone: string
  email_public: string
  linkedin: string
  expertise: string[]
  industries: string[]
  markets: string[]
  credentials: string[]
  years_experience: number | null
  closed_deals_count: number
  booking_url: string
  agency?: { name: string } | null
}

export interface SoldListing {
  listing_id: string
  industry: string | null
  sub_industry: string | null
  location_general: string | null
  asking_price: number | null
  sde: number | null
  multiple: number | null
  closed_at: string | null
  published_at?: string | null
}

/** Anonymized recently-sold listings (public RPC — never names/addresses). */
export async function fetchSoldListings(agency: string | null = null): Promise<SoldListing[]> {
  const { data, error } = await supabase.rpc('get_public_sold_listings', { p_agency: agency })
  if (error || !data) return []
  return (data as any[]).map((row) => ({
    listing_id: row.listing_id,
    industry: row.industry || null,
    sub_industry: row.sub_industry || null,
    location_general: row.location_general || null,
    asking_price: numberOrNull(row.asking_price),
    sde: numberOrNull(row.sde),
    multiple: numberOrNull(row.multiple),
    closed_at: row.closed_at || null,
    published_at: row.published_at || null,
  }))
}

export async function fetchPublicBrokers(): Promise<PublicBroker[]> {
  const { data, error } = await supabase
    .from('broker_profiles')
    .select('*, agency:agencies(name)')
    .eq('is_public', true)
    .limit(100)
  if (error || !data) return []
  return (data as any[]).map((broker) => ({
    id: broker.id,
    profile_id: broker.profile_id || null,
    agency_id: broker.agency_id || null,
    public_name: broker.public_name || '',
    title: broker.title || 'Business Broker',
    bio: broker.bio || '',
    avatar_url: broker.avatar_url || '',
    phone: broker.phone || '',
    email_public: broker.email_public || '',
    linkedin: broker.linkedin || '',
    expertise: stringArray(broker.expertise),
    industries: stringArray(broker.industries),
    markets: stringArray(broker.markets),
    credentials: stringArray(broker.credentials),
    years_experience: numberOrNull(broker.years_experience),
    closed_deals_count: Number(broker.closed_deals_count || 0),
    booking_url: broker.booking_url || '',
    agency: broker.agency,
  }))
}

/** Fetch one public broker profile by its public id (broker_profiles.id). */
export async function fetchPublicBrokerById(id: string): Promise<PublicBroker | null> {
  const { data, error } = await supabase
    .from('broker_profiles')
    .select('*, agency:agencies(name)')
    .eq('id', id)
    .eq('is_public', true)
    .maybeSingle()
  if (error || !data) return null
  const b = data as any
  return {
    id: b.id,
    profile_id: b.profile_id || null,
    agency_id: b.agency_id || null,
    public_name: b.public_name || '',
    title: b.title || 'Business Broker',
    bio: b.bio || '',
    avatar_url: b.avatar_url || '',
    phone: b.phone || '',
    email_public: b.email_public || '',
    linkedin: b.linkedin || '',
    expertise: stringArray(b.expertise),
    industries: stringArray(b.industries),
    markets: stringArray(b.markets),
    credentials: stringArray(b.credentials),
    years_experience: numberOrNull(b.years_experience),
    closed_deals_count: Number(b.closed_deals_count || 0),
    booking_url: b.booking_url || '',
    agency: b.agency,
  }
}

/** Reverse lookup by auth profile id (listings.agent_id → broker profile). */
export async function fetchBrokerByProfileId(profileId: string): Promise<PublicBroker | null> {
  const { data, error } = await supabase
    .from('broker_profiles')
    .select('*, agency:agencies(name)')
    .eq('profile_id', profileId)
    .eq('is_public', true)
    .maybeSingle()
  if (error || !data) return null
  const b = data as any
  return {
    id: b.id,
    profile_id: b.profile_id || null,
    agency_id: b.agency_id || null,
    public_name: b.public_name || '',
    title: b.title || 'Business Broker',
    bio: b.bio || '',
    avatar_url: b.avatar_url || '',
    phone: b.phone || '',
    email_public: b.email_public || '',
    linkedin: b.linkedin || '',
    expertise: stringArray(b.expertise),
    industries: stringArray(b.industries),
    markets: stringArray(b.markets),
    credentials: stringArray(b.credentials),
    years_experience: numberOrNull(b.years_experience),
    closed_deals_count: Number(b.closed_deals_count || 0),
    booking_url: b.booking_url || '',
    agency: b.agency,
  }
}

/** Listings published by a broker's profile id (from the safe public feed). */
export async function fetchListingsByBroker(profileId: string): Promise<PublicMarketplaceListing[]> {
  const all = await fetchPublicFeed()
  return all.filter((l) => l.broker_id === profileId)
}

export interface PublicLeadInput {
  kind: 'buyer' | 'seller'
  name: string
  email: string
  phone?: string
  source: string
  message?: string
  listing_id?: string | null
  budget_range?: string
  industries_interest?: string
  preferred_location?: string
  timeframe?: string
  funds_available?: number | null
  financing_method?: string
  business_name?: string
  industry?: string
  revenue_range?: string
  location_general?: string
}

export async function capturePublicLead(input: PublicLeadInput): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  // Dedupe check: same email already in the CRM? Surface it instead of
  // creating a second row (buyers/sellers may revisit after a while).
  try {
    const email = (input.email || '').trim().toLowerCase()
    if (email) {
      const table = input.kind === 'seller' ? 'seller_leads' : 'buyer_leads'
      const { data: existing } = await supabase
        .from(table)
        .select('id, full_name, status')
        .ilike('email', email)
        .limit(1)
      if (existing && existing.length > 0) {
        return { ok: true, duplicate: true }
      }
    }
  } catch { /* dedupe is best-effort — fall through to insert */ }

  // Verified-buyer stamp: when the inquirer holds an active Match Pass,
  // flag the lead so brokers see serious buyers first.
  let verifiedBuyer = false
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email && user.email.toLowerCase() === input.email.toLowerCase()) {
      const { data: sub } = await supabase
        .from('buyer_subscriptions')
        .select('status')
        .eq('profile_id', user.id)
        .maybeSingle()
      verifiedBuyer = sub?.status === 'active' || sub?.status === 'trialing'
    }
  } catch { /* stamping is best-effort */ }

  const { error } = input.kind === 'seller'
    ? await supabase.from('seller_leads').insert({
        full_name: input.name,
        business_name: input.business_name || null,
        email: input.email,
        phone: input.phone || null,
        industry: input.industry || null,
        revenue_range: input.revenue_range || null,
        location_general: input.location_general || null,
        timeframe: input.timeframe || null,
        message: input.message || null,
        status: 'new',
      })
    : await supabase.from('buyer_leads').insert({
        full_name: input.name,
        email: input.email,
        phone: input.phone || null,
        listing_id: input.listing_id || null,
        budget_range: input.budget_range || null,
        industries_interest: input.industries_interest || null,
        preferred_location: input.preferred_location || null,
        timeframe: input.timeframe || null,
        funds_available: input.funds_available ?? null,
        financing_method: input.financing_method || null,
        message: input.message || null,
        status: 'new',
        verified_buyer: verifiedBuyer || null,
      })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
