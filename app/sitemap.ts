import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase/server'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

const STATIC: MetadataRoute.Sitemap = [
  { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1.0 },
  { url: `${BASE}/marketplace`, changeFrequency: 'weekly', priority: 0.9 },
  { url: `${BASE}/marketplace/buy`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${BASE}/marketplace/sell`, changeFrequency: 'monthly', priority: 0.7 },
  { url: `${BASE}/marketplace/brokers`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${BASE}/marketplace/trust`, changeFrequency: 'monthly', priority: 0.6 },
  { url: `${BASE}/legal/terms`, changeFrequency: 'yearly', priority: 0.3 },
  { url: `${BASE}/legal/privacy`, changeFrequency: 'yearly', priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [...STATIC]

  try {
    const client = createServerClient()
    if (!client) return entries
    const { data } = await client.rpc('get_public_listing_feed', { p_slug: null })
    for (const listing of data || []) {
      entries.push({
        url: `${BASE}/marketplace/listings/${listing.slug || listing.listing_id}`,
        lastModified: listing.published_at || new Date(),
        changeFrequency: 'daily',
        priority: 0.8,
      })
    }
  } catch {
    // Keep static routes available if the marketplace feed is unavailable.
  }

  return entries
}
