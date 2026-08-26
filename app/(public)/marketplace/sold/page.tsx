/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchSoldListings, type SoldListing } from '@/lib/marketplace'
import { getPublicAgencyContext } from '@/lib/publicAgency'
import SoldFilters from '@/components/public/SoldFilters'
import { safeJsonLd } from '@/lib/safeJsonLd'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

const fmt$ = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

export const metadata: Metadata = {
  title: 'Recently Sold Businesses — Proof of Results',
  description: 'Businesses sold confidentially through Concord. See the industries, locations, and sale multiples — never the names.',
  alternates: { canonical: `${BASE}/marketplace/sold` },
}

export default async function SoldListingsPage() {
  const agency = await getPublicAgencyContext()
  const sold = await fetchSoldListings(agency?.scope || null)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Recently Sold Businesses',
    description: 'Businesses sold confidentially through Concord.',
    url: `${BASE}/marketplace/sold`,
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 24px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Proof of Results</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 36, color: '#1a1a2e', margin: '10px 0 12px' }}>
          Sold Confidentially, Every Time
        </h1>
        <p style={{ color: '#666', fontSize: 15, maxWidth: 620, margin: '0 auto', lineHeight: 1.6 }}>
          We never share business names or owner identities — confidentiality is the foundation of every sale.
          Here's the proof: real industries, real markets, real results.
        </p>
      </div>

      {sold.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Sales close behind closed doors</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Recent transactions stay confidential until the owners say otherwise. Contact a broker about closed deals in your industry.
          </div>
        </div>
      ) : (
        <SoldFilters sold={sold} />
      )}

      <div style={{ textAlign: 'center', marginTop: 48, background: '#1a1a2e', borderRadius: 14, padding: '40px 24px', color: '#fff' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 700 }}>Ready to join them?</div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, margin: '10px 0 22px', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
          Get a free, confidential valuation of your business — no obligation, no pressure.
        </div>
        <Link
          href="/marketplace/sell"
          style={{ background: '#c9a84c', color: '#1a1a2e', padding: '13px 28px', borderRadius: 6, textDecoration: 'none', fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 15 }}
        >
          Get a Free Valuation →
        </Link>
      </div>
    </div>
  )
}

function SoldCard({ sold }: { sold: SoldListing }) {
  const daysToSell =
    sold.published_at && sold.closed_at
      ? Math.max(0, Math.round((new Date(sold.closed_at).getTime() - new Date(sold.published_at).getTime()) / 86400000))
      : null
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 22, boxShadow: '0 2px 10px rgba(26,26,46,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ background: '#f0ecdf', color: '#1a1a2e', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
          {sold.industry || 'Business'}
        </span>
        <span style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>✓ SOLD</span>
      </div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{sold.location_general || 'Location confidential'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Asking Price</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>{fmt$(sold.asking_price)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sold at Multiple</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#c9a84c' }}>{sold.multiple != null ? `${sold.multiple.toFixed(2)}×` : '—'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        {sold.sde != null && <div style={{ fontSize: 12, color: '#999' }}>Based on ~{fmt$(sold.sde)} SDE</div>}
        {daysToSell != null && (
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0e7490' }}>
            Sold in {daysToSell} {daysToSell === 1 ? 'day' : 'days'}
          </div>
        )}
      </div>
    </div>
  )
}
