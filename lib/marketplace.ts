// =============================================================================
// Public marketplace helpers. Public listing data must only come from the
// allowlisted get_public_listing_feed RPC; never query the private listings
// table from a public route or browser component.
// =============================================================================

import { supabase } from '@/lib/supabase/client'

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
  }
}

async function fetchPublicFeed(identifier: string | null = null): Promise<PublicMarketplaceListing[]> {
  const { data, error } = await supabase.rpc('get_public_listing_feed', { p_slug: identifier })
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

export async function fetchMarketplaceStats(): Promise<MarketplaceStats> {
  const listings = await fetchPublicFeed()
  const prices = listings.map((listing) => listing.asking_price).filter((price): price is number => price !== null)
  const industries = new Set(listings.map((listing) => listing.industry).filter(Boolean)).size

  return {
    totalListings: listings.length,
    avgAsking: prices.length ? Math.round(prices.reduce((total, price) => total + price, 0) / prices.length) : 0,
    totalBusinessesSold: 0,
    industries,
  }
}

export async function searchPublicListings(filters: SearchFilters = {}): Promise<PublicMarketplaceListing[]> {
  const query = filters.query?.trim().toLowerCase()
  const industry = filters.industry?.trim().toLowerCase()
  const location = filters.location?.trim().toLowerCase()

  return (await fetchPublicFeed())
    .filter((listing) => !industry || listing.industry?.toLowerCase() === industry)
    .filter((listing) => !location || listing.location_general?.toLowerCase().includes(location))
    .filter((listing) => !filters.minPrice || (listing.asking_price !== null && listing.asking_price >= filters.minPrice))
    .filter((listing) => !filters.maxPrice || (listing.asking_price !== null && listing.asking_price <= filters.maxPrice))
    .filter((listing) => !filters.maxRevenue || (listing.annual_revenue !== null && listing.annual_revenue <= filters.maxRevenue))
    .filter((listing) => {
      if (!query) return true
      return [listing.public_title, listing.public_summary, listing.industry, listing.sub_industry]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    })
    .slice(0, 100)
}

export async function fetchFeaturedListings(limit = 6): Promise<PublicMarketplaceListing[]> {
  return (await fetchPublicFeed())
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
    .slice(0, limit)
}

export async function fetchAllIndustries(): Promise<string[]> {
  const unique = new Set((await fetchPublicFeed()).map((listing) => listing.industry).filter((value): value is string => Boolean(value)))
  return Array.from(unique).sort()
}

export interface PublicBroker {
  id: string
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

export async function fetchPublicBrokers(): Promise<PublicBroker[]> {
  const { data, error } = await supabase
    .from('broker_profiles')
    .select('*, agency:agencies(name)')
    .eq('is_public', true)
    .limit(100)
  if (error || !data) return []
  return (data as any[]).map((broker) => ({
    id: broker.id,
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

export async function capturePublicLead(input: PublicLeadInput): Promise<{ ok: boolean; error?: string }> {
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
      })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
