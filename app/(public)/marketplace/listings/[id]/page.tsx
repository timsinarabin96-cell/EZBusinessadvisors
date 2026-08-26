import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { normalizePublicListing, type PublicMarketplaceListing } from '@/lib/marketplace'
import ListingDetailInteractive from '@/components/public/ListingDetailInteractive'
import SimilarListings from '@/components/public/SimilarListings'
import DealProfessionalsPanel from '@/components/public/DealProfessionalsPanel'
import AgentContactCard from '@/components/public/AgentContactCard'
import ListingMarketContextPanel from '@/components/public/ListingMarketContextPanel'
import { fetchPublicListingMeta } from '@/lib/publicListingMeta'
import { fetchListingMarketContext } from '@/lib/listingMarketContext'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

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
  const description = listing.public_summary?.slice(0, 155) || 'A confidential business acquisition opportunity represented by Concord Deal Exchange.'
  const images = listing.gallery_urls.slice(0, 1)
  const identifier = listing.slug || listing.id

  return {
    title,
    description,
    alternates: { canonical: `${BASE}/marketplace/listings/${identifier}` },
    openGraph: { title, description, type: 'website', url: `${BASE}/marketplace/listings/${identifier}`, siteName: 'Concord Deal Exchange', images: images.map((url) => ({ url, width: 1200, height: 630, alt: listing.public_title })) },
    twitter: { card: 'summary_large_image', title, description, images },
  }
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing) notFound()

  // Listing ID (listing_ref) + assigned agent contact — server-side enrichment.
  const meta = await fetchPublicListingMeta(listing.slug || listing.id)

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
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/marketplace/listings" style={{ color: '#888', textDecoration: 'none', fontSize: 14, fontFamily: 'Georgia, serif' }}>← Back to listings</Link>
      <div style={{ margin: '20px 0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#1a1a2e', margin: 0 }}>{listing.public_title}</h1>
          <span style={{ background: '#f0ecdf', color: '#1a1a2e', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>{listing.industry || 'Business'}</span>
          {meta?.listingRef && (
            <span style={{ background: '#1a1a2e', color: '#c9a84c', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              🆔 {meta.listingRef}
            </span>
          )}
          {listing.is_confidential && <span style={{ background: '#1a1a2e', color: '#fff', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>Confidential</span>}
        </div>
        {listing.location_general && <p style={{ color: '#888', fontSize: 14, margin: '8px 0 0' }}>📍 {listing.location_general}</p>}
      </div>
      <div style={{ marginBottom: 20 }}>
        <AgentContactCard agent={meta?.agent || null} />
      </div>
      <ListingMarketContextPanel ctx={marketCtx} />
      <ListingDetailInteractive listing={listing} />
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <Link
          href={`/flyer/${listing.slug || listing.id}`}
          style={{
            padding: '11px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14,
            background: '#1a1a2e', color: '#fff', fontFamily: 'Georgia, serif',
          }}
        >
          🖨️ Print / Save Flyer
        </Link>
      </div>
      <DealProfessionalsPanel listing={listing} />
      <SimilarListings listing={listing} />
    </div>
  )
}
