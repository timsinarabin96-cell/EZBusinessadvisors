import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// sitemap.xml — public listings + static marketing routes.
// Listings are fetched via the server client (service role) so every live
// listing gets indexed. Best-effort: if the DB is unavailable we still emit
// the static routes rather than failing the whole sitemap.
// ---------------------------------------------------------------------------

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

const STATIC: MetadataRoute.Sitemap = [
  { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1.0 },
  { url: `${BASE}/marketplace`, changeFrequency: 'weekly', priority: 0.9 },
  { url: `${BASE}/marketplace/buy`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${BASE}/marketplace/sell`, changeFrequency: 'monthly', priority: 0.7 },
  { url: `${BASE}/marketplace/brokers`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${BASE}/legal/terms`, changeFrequency: 'yearly', priority: 0.3 },
  { url: `${BASE}/legal/privacy`, changeFrequency: 'yearly', priority: 0.3 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [...STATIC]

  try {
    const sb = createServerClient()
    if (!sb) return entries // not configured — static routes only
    const { data } = await sb.from('listings').select('id, updated_at, status').eq('status', 'active')
    const rows = (data || []) as { id: string; updated_at?: string | null }[]
    for (const r of rows) {
      entries.push({
        url: `${BASE}/marketplace/listings/${r.id}`,
        lastModified: r.updated_at || new Date(),
        changeFrequency: 'daily',
        priority: 0.8,
      })
    }
  } catch {
    // Non-fatal — static routes above remain.
  }

  return entries
}
