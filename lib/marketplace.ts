// =============================================================================
// Public listing marketplace helpers — query active listings for the public
// site, broker directory, and marketplace stats.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { Listing } from '@/lib/listings'

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

export async function fetchMarketplaceStats(): Promise<MarketplaceStats> {
  const { data, error } = await supabase
    .from('listings')
    .select('asking_price, industry')
    .eq('status', 'active')
  if (error || !data) return { totalListings: 0, avgAsking: 0, totalBusinessesSold: 0, industries: 0 }

  const prices = data.map((l: any) => l.asking_price).filter((p: any) => typeof p === 'number') as number[]
  const industries = new Set((data as any[]).map((l) => l.industry).filter(Boolean)).size
  return {
    totalListings: data.length,
    avgAsking: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
    totalBusinessesSold: 128, // demo metric — replace with real closed-deal count
    industries,
  }
}

export async function searchPublicListings(filters: SearchFilters = {}): Promise<Listing[]> {
  let query = supabase.from('listings').select('*').eq('status', 'active')

  if (filters.industry) query = query.eq('industry', filters.industry)
  if (filters.location) query = query.ilike('location_general', `%${filters.location}%`)
  if (filters.minPrice) query = query.gte('asking_price', filters.minPrice)
  if (filters.maxPrice) query = query.lte('asking_price', filters.maxPrice)
  if (filters.query) {
    const like = `%${filters.query}%`
    query = query.or(`business_name.ilike.${like},headline.ilike.${like},industry.ilike.${like}`)
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(100)
  if (error) {
    console.error('searchPublicListings error:', error)
    return []
  }
  return (data as Listing[]) || []
}

export async function fetchFeaturedListings(limit = 6): Promise<Listing[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data as Listing[]
}

export async function fetchAllIndustries(): Promise<string[]> {
  const { data, error } = await supabase.from('listings').select('industry').eq('status', 'active')
  if (error || !data) return []
  const unique = new Set((data as any[]).map((l) => l.industry).filter(Boolean))
  return Array.from(unique).sort() as string[]
}

// Broker directory
export interface PublicBroker {
  id: string
  public_name: string
  title: string
  bio: string
  avatar_url: string
  phone: string
  email_public: string
  linkedin: string
  agency?: { name: string } | null
}

export async function fetchPublicBrokers(): Promise<PublicBroker[]> {
  const { data, error } = await supabase
    .from('broker_profiles')
    .select('*, agency:agencies(name)')
    .eq('is_public', true)
    .limit(100)
  if (error || !data) return []
  return (data as any[]).map((b) => ({
    id: b.id,
    public_name: b.public_name || '',
    title: b.title || 'Business Broker',
    bio: b.bio || '',
    avatar_url: b.avatar_url || '',
    phone: b.phone || '',
    email_public: b.email_public || '',
    linkedin: b.linkedin || '',
    agency: b.agency,
  }))
}

// Lead capture from public forms
export interface PublicLeadInput {
  kind: 'buyer' | 'seller'
  name: string
  email: string
  phone?: string
  source: string
  message?: string
  listing_id?: string | null
}

export async function capturePublicLead(input: PublicLeadInput): Promise<{ ok: boolean; error?: string }> {
  // Sellers -> seller_leads; Buyers -> buyer_leads (reuse existing real tables).
  const table = input.kind === 'seller' ? 'seller_leads' : 'buyer_leads'
  const payload: any =
    input.kind === 'seller'
      ? { business_name: input.name, email: input.email, phone: input.phone || null, status: 'new' }
      : { email: input.email, phone: input.phone || null, status: 'new' }

  const { error } = await supabase.from(table).insert(payload)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
