/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase/server'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

const STATIC: MetadataRoute.Sitemap = [
  { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1.0 },
  { url: `${BASE}/marketplace`, changeFrequency: 'weekly', priority: 0.9 },
  { url: `${BASE}/marketplace/buy`, changeFrequency: 'weekly', priority: 0.8 },
  { url: `${BASE}/marketplace/sell`, changeFrequency: 'monthly', priority: 0.7 },
  { url: `${BASE}/marketplace/sold`, changeFrequency: 'monthly', priority: 0.8 },
  { url: `${BASE}/marketplace/brokers`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${BASE}/about`, changeFrequency: 'monthly', priority: 0.5 },
  { url: `${BASE}/contact`, changeFrequency: 'monthly', priority: 0.5 },
  { url: `${BASE}/marketplace/trust`, changeFrequency: 'monthly', priority: 0.6 },
  { url: `${BASE}/platform`, changeFrequency: 'monthly', priority: 0.6 },
  { url: `${BASE}/license`, changeFrequency: 'monthly', priority: 0.7 },
  { url: `${BASE}/cbi`, changeFrequency: 'monthly', priority: 0.7 },
  { url: `${BASE}/verify`, changeFrequency: 'monthly', priority: 0.6 },
  { url: `${BASE}/pricing`, changeFrequency: 'monthly', priority: 0.5 },
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

    // Industry + location landing pages (dynamic slugs) — the SEO workhorses.
    // lastModified = most recent seller-approved listing in that group
    // (sitemap freshness). Derived from the public RPC feed only — never the
    // private listings table.
    const feed = data || []
    const industryLastmod = new Map<string, Date>()
    const locationLastmod = new Map<string, Date>()
    for (const row of feed) {
      if (row.industry) {
        const ts = row.published_at ? new Date(row.published_at) : new Date()
        if (!industryLastmod.has(row.industry) || ts > industryLastmod.get(row.industry)!) {
          industryLastmod.set(row.industry, ts)
        }
      }
      if (row.location_general) {
        const ts = row.published_at ? new Date(row.published_at) : new Date()
        if (!locationLastmod.has(row.location_general) || ts > locationLastmod.get(row.location_general)!) {
          locationLastmod.set(row.location_general, ts)
        }
      }
    }
    const seenIndustries = new Set<string>()
    for (const row of feed) {
      const slug = String(row.industry || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      if (slug && !seenIndustries.has(slug)) {
        seenIndustries.add(slug)
        entries.push({
          url: `${BASE}/marketplace/industry/${slug}`,
          lastModified: industryLastmod.get(String(row.industry || '')) || new Date(),
          changeFrequency: 'weekly',
          priority: 0.7,
        })
      }
    }
    const seenLocations = new Set<string>()
    for (const row of feed) {
      const slug = String(row.location_general || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      if (slug && !seenLocations.has(slug)) {
        seenLocations.add(slug)
        entries.push({
          url: `${BASE}/marketplace/location/${slug}`,
          lastModified: locationLastmod.get(String(row.location_general || '')) || new Date(),
          changeFrequency: 'weekly',
          priority: 0.6,
        })
      }
    }

    // Insights articles (public content engine).
    const { data: insights } = await client.from('newspaper_articles').select('slug, published_at').not('slug', 'is', null)
    for (const a of insights || []) {
      entries.push({
        url: `${BASE}/marketplace/insights/${a.slug}`,
        lastModified: a.published_at || new Date(),
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }
  } catch {
    // Keep static routes available if the marketplace feed is unavailable.
  }

  return entries
}
