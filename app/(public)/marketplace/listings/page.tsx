/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { fetchAllIndustries, fetchFeaturedListings, fetchMarketplaceStats, searchPublicListings } from '@/lib/marketplace'
import { getPublicAgencyContext } from '@/lib/publicAgency'
import SearchListingsClient from '@/components/public/SearchListingsClient'
import CategoryCards from '@/components/public/CategoryCards'
import BuyerCapturePrompt from '@/components/public/BuyerCapturePrompt'
import SoldCompsTicker from '@/components/public/SoldCompsTicker'
import CountUpStat from '@/components/public/CountUpStat'
import { SponsoredSlot } from '@/components/public/SponsoredSlot'
import NewsletterSignup from '@/components/public/NewsletterSignup'
import { LoadingState } from '@/components/ui'
import { fmt$ } from '@/lib/recast'
import { listingImageFor } from '@/lib/stockImages'

export const metadata: Metadata = {
  title: 'Businesses for Sale | Buy a Business — Concord Deal Platform',
  description:
    'Browse vetted businesses for sale by industry, location, and price. Confidential financials after NDA. Licensed business brokerage — restaurants, retail, home care, manufacturing and more.',
  alternates: { canonical: '/marketplace/listings' },
  openGraph: {
    title: 'Businesses for Sale | Concord Deal Platform',
    description: 'Vetted, cash-flowing businesses for sale. Sign an NDA to unlock full financials.',
    url: '/marketplace/listings',
  },
}

// =============================================================================
// /marketplace/listings — SERVER-RENDERED for SEO.
// The initial listing grid is fetched on the server (crawlers see real
// content), then hydrated by SearchListingsClient which handles filters,
// natural search, saved-search alerts, and AI match scores client-side.
// =============================================================================

interface PageProps {
  searchParams?: Record<string, string | string[] | undefined>
}

export default async function ListingsPage({ searchParams = {} }: PageProps) {
  const sp = (await searchParams) || {}
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''
  const bool = (v: string | string[] | undefined) => str(v) === '1'
  const agency = await getPublicAgencyContext()
  const scope = agency?.scope || null

  const hasActiveSearch = Boolean(str(sp.q) || str(sp.industry) || str(sp.location) || str(sp.minPrice) || str(sp.maxPrice) || str(sp.maxRevenue) || str(sp.maxSdeMultiple) || bool(sp.absenteeOnly) || bool(sp.franchiseOnly) || bool(sp.financingAvailable) || bool(sp.sbaOnly) || str(sp.status) || str(sp.minEmployees) || str(sp.sortBy))

  const [results, industries, stats, spotlight] = await Promise.all([
    searchPublicListings({
      query: str(sp.q) || undefined,
      industry: str(sp.industry) || undefined,
      location: str(sp.location) || undefined,
      minPrice: str(sp.minPrice) ? Number(str(sp.minPrice)) : undefined,
      maxPrice: str(sp.maxPrice) ? Number(str(sp.maxPrice)) : undefined,
      maxRevenue: str(sp.maxRevenue) ? Number(str(sp.maxRevenue)) : undefined,
      maxSdeMultiple: str(sp.maxSdeMultiple) ? Number(str(sp.maxSdeMultiple)) : undefined,
      absenteeOnly: bool(sp.absenteeOnly) || undefined,
      franchiseOnly: bool(sp.franchiseOnly) || undefined,
      financingAvailable: bool(sp.financingAvailable) || undefined,
      sbaOnly: bool(sp.sbaOnly) || undefined,
      status: (str(sp.status) as any) || undefined,
      minEmployees: str(sp.minEmployees) ? Number(str(sp.minEmployees)) : undefined,
      sortBy: (str(sp.sortBy) as any) || undefined,
    }, scope),
    fetchAllIndustries(scope),
    fetchMarketplaceStats(scope),
    fetchFeaturedListings(4, scope),
  ])

  const statValue = (v: number | null | undefined) => (v != null && !isNaN(v) ? v : 0)

  return (
    <>
      <SponsoredSlot slotKey="marketplace_top" />
      {/* ══ 3D HERO — logo + Businesses for Sale + animated stats ══ */}
      <section style={{ background: 'linear-gradient(135deg,#0f1023 0%,#1a1a2e 45%,#0f3460 100%)', color: '#fff', padding: '56px 24px 64px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 50% at 75% 15%, rgba(201,168,76,0.18), transparent 60%), radial-gradient(ellipse 45% 45% at 15% 85%, rgba(15,52,96,0.6), transparent 65%)' }} />
        <div style={{ position: 'relative', maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          {/* 3D logo emblem */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/concord-3d-logo.png"
              alt="CONCORD — Deal Platform"
              width={150}
              height={150}
              style={{ borderRadius: 26, boxShadow: '0 24px 70px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.3)', objectFit: 'cover' }}
            />
          </div>
          <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 700 }}>Business Marketplace</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 5vw, 52px)', margin: '12px 0 12px', lineHeight: 1.1 }}>
            Businesses for Sale
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 16.5, maxWidth: 620, margin: '0 auto 30px', lineHeight: 1.6 }}>
            Browse vetted, profitable businesses for sale — or list yours confidentially and reach qualified buyers.
          </p>
          {/* Animated stats — same language as the homepage */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 14, maxWidth: 880, margin: '0 auto' }}>
            <CountUpStat value={statValue(stats?.totalListings)} label="Businesses for Sale" />
            <CountUpStat value={statValue(stats?.avgAsking)} label="Avg. Asking Price" prefix="$" accent="#c9a84c" />
            <CountUpStat value={statValue(stats?.totalBusinessesSold)} label="Businesses Sold" accent="#16a34a" />
            <CountUpStat value={statValue(stats?.industries)} label="Industries" accent="#1d4ed8" />
          </div>
        </div>
      </section>
      <SoldCompsTicker limit={8} />
      {!hasActiveSearch && spotlight.length > 0 && (
        <section style={{ background: '#fff', borderBottom: '1px solid #ece8dc', padding: '22px 24px' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>⭐</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1a1a2e', letterSpacing: '.08em', textTransform: 'uppercase' }}>Spotlight listings</span>
              <span style={{ flex: 1, height: 1, background: '#ece8dc' }} />
              <Link href="/marketplace/listings" style={{ fontSize: 12.5, color: '#c9a84c', fontWeight: 800, textDecoration: 'none' }}>All listings →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(230px, 100%), 1fr))', gap: 14 }}>
              {spotlight.map((l) => (
                <Link key={l.id} href={`/marketplace/listings/${l.slug || l.id}`} style={{ textDecoration: 'none', display: 'flex', gap: 12, alignItems: 'center', background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: 10, minWidth: 0, transition: 'box-shadow .15s ease' }}>
                  <div style={{ width: 64, height: 48, borderRadius: 8, overflow: 'hidden', background: '#1a1a2e', flex: '0 0 64px', position: 'relative' }}>
                    {(() => { const img = listingImageFor(l.gallery_urls, l.industry, { title: l.public_title, price: l.asking_price ?? undefined, subIndustry: l.sub_industry }); return img ? <img src={img} alt={l.public_title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 20, color: 'rgba(201,168,76,0.6)', fontWeight: 800 }}>{(l.industry || 'B').slice(0, 1).toUpperCase()}</div> })()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.public_title}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{[l.location_general, l.industry].filter(Boolean).join(' · ')}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#15803d', marginTop: 2 }}>{l.asking_price ? fmt$(l.asking_price) : 'Ask'}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      <Suspense fallback={<LoadingState label="Loading listings..." />}>
        <SearchListingsClient initialResults={results} initialIndustries={industries} initialStats={stats} agencyScope={scope} />
      </Suspense>
      <CategoryCards industries={industries} limit={12} title="Browse by business type" subtitle="Color-coded categories — pick one to explore vetted businesses for sale" />
      <section style={{ background: '#1a1a2e', padding: '26px 24px', marginTop: 0 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 340px', maxWidth: 560 }}>
            <div style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 800, marginBottom: 6 }}>Weekly listings briefing</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>New businesses for sale, straight to your inbox.</div>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, marginTop: 6 }}>
              One email every week — the latest listings, deals closed, and market news. Unsubscribe anytime.
            </div>
          </div>
          <NewsletterSignup />
        </div>
      </section>
      <BuyerCapturePrompt hintIndustry={str(sp.industry) || null} />
      <SponsoredSlot slotKey="marketplace_bottom" />
    </>
  )
}
