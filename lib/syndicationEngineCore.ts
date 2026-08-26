/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// syndicationEngineCore — pure, dependency-free marketplace syndication logic.
// Mirrors the wrapper's provider registry + payload builder so tests can
// import it directly (no path aliases, no Supabase client).
// =============================================================================

export interface SyndicationProvider {
  id: string
  label: string
  url: string
  needsCredentials: boolean
  hint: string
}

export const SYNDICATION_PROVIDERS: SyndicationProvider[] = [
  { id: 'bizbuysell', label: 'BizBuySell', url: 'https://www.bizbuysell.com', needsCredentials: true, hint: 'The largest U.S. business-for-sale marketplace' },
  { id: 'loopnet', label: 'LoopNet', url: 'https://www.loopnet.com', needsCredentials: true, hint: 'Commercial real estate + business listings' },
  { id: 'dealstream', label: 'DealStream', url: 'https://www.dealstream.com', needsCredentials: true, hint: 'M&A deal marketplace for mid-market' },
  { id: 'facebook', label: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace', needsCredentials: false, hint: 'Free local reach for smaller deals' },
  { id: 'local', label: 'Local / Manual', url: '', needsCredentials: false, hint: 'Classifieds, brokers, word of mouth' },
]

export const providerLabel = (id: string): string =>
  SYNDICATION_PROVIDERS.find((p) => p.id === id)?.label || id

export type SyncStatus = 'pending' | 'synced' | 'failed' | 'removed'

/** Build the ready-to-paste syndication payload for a listing. */
export function buildSyncPayload(listing: Record<string, unknown>): Record<string, unknown> {
  const businessName = (listing.business_name as string) || 'Confidential Business'
  const industry = (listing.industry as string) || ''
  const location = (listing.location_general as string) || ''
  const price = listing.asking_price != null ? Number(listing.asking_price) : null
  const sde = listing.sde != null ? Number(listing.sde) : null
  const ebitda = listing.ebitda != null ? Number(listing.ebitda) : null
  const revenue = listing.annual_revenue != null ? Number(listing.annual_revenue) : null

  const description = [
    (listing.public_summary as string) || (listing.description as string) || '',
    industry ? `Industry: ${industry}` : '',
    location ? `Location: ${location}` : '',
    sde ? `SDE: $${Math.round(sde).toLocaleString()}` : '',
    ebitda ? `EBITDA: $${Math.round(ebitda).toLocaleString()}` : '',
    revenue ? `Annual revenue: $${Math.round(revenue).toLocaleString()}` : '',
    'Confidential — contact the listing broker for details.',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    title: `${businessName}${industry ? ` — ${industry}` : ''}${location ? ` (${location})` : ''}`.slice(0, 120),
    price: price ?? null,
    industry: industry || null,
    location: location || null,
    sde,
    ebitda,
    annual_revenue: revenue,
    description,
    listing_ref: (listing.listing_ref as string) || null,
    listing_url: (listing.public_url as string) || null,
    generated_at: new Date().toISOString(),
  }
}
