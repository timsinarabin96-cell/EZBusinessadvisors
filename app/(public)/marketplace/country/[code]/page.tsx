/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchPublicFeed, type PublicMarketplaceListing } from '@/lib/marketplace'
import { getPublicAgencyContext } from '@/lib/publicAgency'
import PublicListingCard from '@/components/public/PublicListingCard'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

const COUNTRY_NAMES: Record<string, string> = {
  US: 'the United States', CA: 'Canada', GB: 'the United Kingdom', AU: 'Australia',
  IN: 'India', AE: 'the UAE', SG: 'Singapore', DE: 'Germany', FR: 'France',
  IE: 'Ireland', NZ: 'New Zealand', ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya',
  PK: 'Pakistan', BD: 'Bangladesh', PH: 'the Philippines', TH: 'Thailand',
  MY: 'Malaysia', ID: 'Indonesia', SG2: 'Singapore', AE2: 'UAE',
}

export async function generateStaticParams() {
  const agency = await getPublicAgencyContext()
  const all = await fetchPublicFeed(null, agency?.scope || null)
  const countries = new Set((all.map((l) => (l.country_code || 'US').toUpperCase()).filter(Boolean)))
  return Array.from(countries).map((code) => ({ code }))
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code: codeParam } = await params
  const code = codeParam.toUpperCase()
  const label = COUNTRY_NAMES[code] || code
  const title = `Businesses for Sale in ${label}`
  const description = `Browse businesses for sale in ${label}. Vetted, profitable opportunities with confidential financials available to qualified buyers — worldwide.`
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/marketplace/country/${code}` },
    openGraph: { title, description, type: 'website', url: `${BASE}/marketplace/country/${code}` },
  }
}

export default async function CountryPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: codeParam } = await params
  const code = codeParam.toUpperCase()
  const label = COUNTRY_NAMES[code] || code
  const all = await fetchPublicFeed()
  const matches: PublicMarketplaceListing[] = all.filter((l) => (l.country_code || 'US').toUpperCase() === code)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Businesses for Sale in ${label}`,
    description: `Browse businesses for sale in ${label}.`,
    url: `${BASE}/marketplace/country/${code}`,
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>🌍 Worldwide Marketplace</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#1a1a2e', margin: '8px 0 0' }}>Businesses for Sale in {label}</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>{matches.length} available{code !== 'US' ? ' · cross-border deals welcome' : ''}</p>
        </div>
        <Link href="/marketplace/listings" style={{ color: '#1a1a2e', fontWeight: 700, fontFamily: 'Georgia, serif', textDecoration: 'none' }}>
          Browse all →
        </Link>
      </div>

      {matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌍</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>No {label} listings yet</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            We're expanding worldwide. <Link href="/marketplace/sell" style={{ color: '#c9a84c', fontWeight: 700 }}>List your business</Link> from anywhere.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {matches.map((l) => (
            <PublicListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 40, background: '#1a1a2e', borderRadius: 14, padding: '36px 24px', color: '#fff', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 700 }}>Sell your business — anywhere in the world</div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, margin: '10px auto 22px', maxWidth: 560 }}>
          List in your local currency, reach buyers globally, and close with confidence. Compliance guidance for your state and country included.
        </div>
        <Link href="/marketplace/sell" style={{ background: '#c9a84c', color: '#1a1a2e', padding: '13px 28px', borderRadius: 6, textDecoration: 'none', fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 15 }}>
          List Your Business →
        </Link>
      </div>
    </div>
  )
}
