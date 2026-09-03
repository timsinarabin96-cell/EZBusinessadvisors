/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { normalizePublicListing, type PublicMarketplaceListing } from '@/lib/marketplace'
import ListingDetailInteractive from '@/components/public/ListingDetailInteractive'
import FranchiseDetailsPanel from '@/components/public/FranchiseDetailsPanel'
import { ToastProvider } from '@/components/ui/Toast'
import SimilarListings from '@/components/public/SimilarListings'
import DealProfessionalsPanel from '@/components/public/DealProfessionalsPanel'
import BrokerFloat from '@/components/public/BrokerFloat'
import ListingMarketContextPanel from '@/components/public/ListingMarketContextPanel'
import { fetchPublicListingMeta } from '@/lib/publicListingMeta'
import { fetchListingMarketContext } from '@/lib/listingMarketContext'
import { safeJsonLd } from '@/lib/safeJsonLd'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concorddeal.com'

async function getListing(identifier: string): Promise<PublicMarketplaceListing | null> {
  const client = createServerClient()
  if (!client) return null

  const { data, error } = await client.rpc('get_public_listing_feed', { p_slug: identifier })
  if (error || !data?.length) return null
  return normalizePublicListing(data[0])
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) return { title: 'Listing Not Found', robots: { index: false } }

  const title = `${listing.public_title}${listing.location_general ? ` — ${listing.location_general}` : ''}`
  const description = listing.public_summary?.slice(0, 155) || 'A confidential business acquisition opportunity represented by Concord Deal Platform.'
  const images = listing.gallery_urls.slice(0, 1)
  const identifier = listing.slug || listing.id

  return {
    title,
    description,
    alternates: { canonical: `${BASE}/marketplace/listings/${identifier}` },
    openGraph: { title, description, type: 'website', url: `${BASE}/marketplace/listings/${identifier}`, siteName: 'Concord Deal Platform', images: images.map((url) => ({ url, width: 1200, height: 630, alt: listing.public_title })) },
    twitter: { card: 'summary_large_image', title, description, images },
  }
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) notFound()

  // Listing ID (listing_ref) + assigned agent contact — server-side enrichment.
  const meta = await fetchPublicListingMeta(listing.slug || listing.id)

  // Phase 0 brand resolver: the NDA guide text names the BROKER's firm, not
  // the platform. meta.agent.agencyName is the listing agency's name (same
  // source the resolver uses — live agencies have no separate legal_name
  // column). Buyer gate defaults to the platform's own firm when unset.
  const agencyLegalName = meta?.agent?.agencyName ?? undefined

  // Buyer-facing market context: typical sale multiple, price position, comps.
  const marketCtx = await fetchListingMarketContext({
    industry: listing.industry,
    asking_price: listing.asking_price,
    sde: listing.sde,
    ebitda: listing.ebitda,
    location_general: listing.location_general,
    established_year: listing.established_year,
  })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.public_title,
    description: listing.public_summary || undefined,
    image: listing.gallery_urls[0] || undefined,
    category: listing.industry || undefined,
    offers: listing.asking_price !== null ? { '@type': 'Offer', priceCurrency: 'USD', price: listing.asking_price, availability: 'https://schema.org/InStock' } : undefined,
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 48px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      {/* ══ PREMIUM HERO — dark aurora + grad-gold headline (billion-dollar pass) ══ */}
      <section style={{ background: 'linear-gradient(160deg,#0b1020 0%,#101a38 42%,#0f2a52 100%)', color: '#fff', padding: '40px 24px 44px', margin: '0 -24px 28px', position: 'relative', overflow: 'hidden' }}>
        <div className="hero-aurora" />
        <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto' }}>
          <Link href="/marketplace/listings" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ← Back to listings
          </Link>
          <div style={{ margin: '18px 0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.08, letterSpacing: '-0.03em', color: '#fff', margin: 0 }}>
                <span className="grad-gold">{listing.public_title}</span>
              </h1>
              <span style={{ background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.4)', color: '#f0d98c', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>{listing.industry || 'Business'}</span>
              {meta?.listingRef && (
                <span style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#f0d98c', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                  🆔 {meta.listingRef}
                </span>
              )}
              {listing.is_confidential && <span style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>Confidential</span>}
            </div>
            {listing.location_general && <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14.5, margin: '10px 0 0' }}>📍 {listing.location_general}</p>}
          </div>
        </div>
      </section>
      <BrokerFloat agent={meta?.agent || null} />
      <ListingMarketContextPanel ctx={marketCtx} />
      <ToastProvider>
        <ListingDetailInteractive listing={listing} agencyLegalName={agencyLegalName} />
        {listing.is_franchise && <FranchiseDetailsPanel listingId={listing.id} />}
      </ToastProvider>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Link
          href={`/flyer/${listing.slug || listing.id}`}
          className="cta-ghost-dark"
          style={{ background: '#1a1a2e', border: '1px solid rgba(201,168,76,0.35)', color: '#f0d98c' }}
        >
          🖨️ Print / Save Flyer
        </Link>
      </div>
      <DealProfessionalsPanel listing={listing} />
      <SimilarListings listing={listing} />
    </div>
  )
}
