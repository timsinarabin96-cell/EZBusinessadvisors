import { ImageResponse } from 'next/og'
import { createServerClient } from '@/lib/supabase/server'
import { normalizePublicListing } from '@/lib/marketplace'
import { fetchPublicListingMeta } from '@/lib/publicListingMeta'

export const runtime = 'edge'
export const alt = 'Business for sale'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// =============================================================================
// /marketplace/listings/[id]/opengraph-image — auto-generated social card.
// Renders the listing's photo + title + price + listing ID + agent name so
// links shared on WhatsApp/Facebook/LinkedIn look like a real flyer.
// =============================================================================

async function getListing(identifier: string) {
  const client = createServerClient()
  if (!client) return null
  const { data, error } = await client.rpc('get_public_listing_feed', { p_slug: identifier })
  if (error || !data?.length) return null
  return normalizePublicListing(data[0])
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : null)

export default async function Image({ params }: { params: { id: string } }) {
  const listing = await getListing(params.id)
  const meta = listing ? await fetchPublicListingMeta(listing.slug || listing.id) : null

  const title = listing?.public_title || 'Business for Sale'
  const price = money(listing?.asking_price ?? null)
  const photo = listing?.gallery_urls?.[0] || null
  const agentName = meta?.agent?.name || null
  const listingId = meta?.listingRef || null

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0f2038', color: '#fff', fontFamily: 'Georgia, serif' }}>
        {/* Photo band (or navy fallback) */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 90 }}>🏢</div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,20,40,0.15) 0%, rgba(10,20,40,0.92) 100%)' }} />
        </div>

        {/* Text block */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '40px 56px', gap: 12, background: '#0f2038' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: '#c9a84c', letterSpacing: '0.04em' }}>{title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 20, color: 'rgba(255,255,255,0.85)' }}>
            {price && <span style={{ fontWeight: 800, color: '#fff', fontSize: 26 }}>{price}</span>}
            {listing?.location_general && <span>📍 {listing.location_general}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, fontSize: 16, color: 'rgba(255,255,255,0.75)' }}>
            {listingId && <span style={{ background: 'rgba(201,168,76,0.18)', border: '1px solid rgba(201,168,76,0.5)', padding: '6px 14px', borderRadius: 999, fontWeight: 700, color: '#e0c97e' }}>🆔 {listingId}</span>}
            {agentName && <span>🤝 {agentName}</span>}
          </div>
        </div>
      </div>
    ),
    size,
  )
}
