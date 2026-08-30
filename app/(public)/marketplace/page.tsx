/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import Link from 'next/link'
import { fetchMarketplaceStats, fetchAllIndustries, fetchPublicFeed } from '@/lib/marketplace'
import { getPublicAgencyContext } from '@/lib/publicAgency'
import CountUpStat from '@/components/public/CountUpStat'
import MarketplaceSearch from '@/components/public/MarketplaceSearch'
import CategoryCards, { BUSINESS_CATEGORIES } from '@/components/public/CategoryCards'

// /marketplace — public marketplace home hub. Premium 3D-style landing:
// 3D logo hero + glassmorphism search with live suggestions + animated stats
// (always comma-formatted) + depth cards.
export default async function MarketplaceHome() {
  const agency = await getPublicAgencyContext()
  const scope = agency?.scope || null
  const [stats, industries, feed] = await Promise.all([fetchMarketplaceStats(scope), fetchAllIndustries(scope), fetchPublicFeed(null, scope)])

  const locations = Array.from(new Set((feed || []).map((l) => l.location_general).filter((x): x is string => Boolean(x)))).slice(0, 8)

  const statValue = (v: number | null | undefined) => (v != null && !isNaN(v) ? v : 0)

  return (
    <div>
      <style>{`.mp-depth-card:hover { transform: translateY(-5px); box-shadow: 0 22px 50px rgba(16,42,67,0.18), 0 0 0 1px rgba(201,168,76,0.35), inset 0 1px 0 rgba(255,255,255,0.9); } @media (hover: none) { .mp-depth-card:hover { transform: none; } }`}</style>
      {/* ══ HERO — 3D logo + glass search ══ */}
      <section style={{ background: 'linear-gradient(135deg,#0f1023 0%,#1a1a2e 45%,#0f3460 100%)', color: '#fff', padding: '64px 24px 72px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 50% at 75% 15%, rgba(201,168,76,0.18), transparent 60%), radial-gradient(ellipse 45% 45% at 15% 85%, rgba(15,52,96,0.6), transparent 65%)' }} />
        <div style={{ position: 'relative', maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          {/* 3D logo emblem */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/concord-3d-logo.png"
              alt="CONCORD — Deal Platform"
              width={180}
              height={180}
              style={{ borderRadius: 28, boxShadow: '0 24px 70px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.3)', objectFit: 'cover' }}
            />
          </div>
          <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 700 }}>The Marketplace</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 5vw, 52px)', margin: '12px 0 12px', lineHeight: 1.1 }}>
            Find your next business
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 16.5, maxWidth: 620, margin: '0 auto 30px', lineHeight: 1.6 }}>
            Browse vetted, profitable businesses for sale — or list yours confidentially and reach qualified buyers.
          </p>

          {/* Glassmorphism search with live suggestions */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <MarketplaceSearch industries={industries || []} locations={locations} />
          </div>

          {/* Trust chips */}
          <div style={{ marginTop: 24, display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            <span>🔒 NDA-protected</span>
            <span>📊 Recast financials</span>
            <span>⚖️ Broker-valued</span>
            <span>🏦 SBA financing ready</span>
          </div>
        </div>
      </section>

      {/* ══ ANIMATED STATS — always comma-formatted ══ */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 16 }}>
          <CountUpStat value={statValue(stats?.totalListings)} label="Businesses for Sale" />
          <CountUpStat value={statValue(stats?.avgAsking)} label="Avg. Asking Price" prefix="$" accent="#c9a84c" />
          <CountUpStat value={statValue(stats?.totalBusinessesSold)} label="Businesses Sold" accent="#16a34a" />
          <CountUpStat value={statValue(stats?.industries)} label="Industries" accent="#1d4ed8" />
        </div>

        {/* ══ ENTRY CARDS — depth + gold CTAs (no emoji, gold icons) ══ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', gap: 18, margin: '34px 0 8px' }}>
          <Card href="/marketplace/listings" icon="🔍" title="Buy a Business" desc="Browse active listings with full financial snapshots, filters, and SBA/financing indicators." cta="Browse listings" />
          <Card href="/marketplace/sell" icon="💰" title="Sell a Business" desc="Get a free valuation and list your business confidentially with a dedicated broker." cta="Start selling" />
          <Card href="/marketplace/sold" icon="✅" title="Recently Sold" desc="See real sold comps and what businesses are actually trading for in your market." cta="View sold comps" />
          <Card href="/marketplace/professionals" icon="🤝" title="Deal Professionals" desc="Attorneys, CPAs, lenders, and consultants ready to help close your deal." cta="Find experts" />
          <Card href="/marketplace/pocket" icon="🤫" title="Pocket Listings" desc="Off-market opportunities available exclusively through our brokers — request confidential access." cta="Explore pocket listings" />
        </div>
      </div>

      {/* ══ COLORED CATEGORY CARDS ══ */}
      <CategoryCards industries={industries || []} limit={12} title="Browse by business type" subtitle="Color-coded categories — pick one to explore vetted businesses for sale" />

      {/* ══ INDUSTRY PILLS — SEO entry points (kept, slim) ══ */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '34px 24px 60px' }}>
        <div style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>All industries</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(industries || []).slice(0, 24).map((ind) => (
            <Link key={ind} href={`/marketplace/industry/${encodeURIComponent(ind.toLowerCase().replace(/\s+/g, '-'))}`}
              style={{ padding: '8px 18px', borderRadius: 99, fontSize: 13, fontWeight: 700, textDecoration: 'none', background: '#faf9f4', color: '#1a1a2e', border: '1px solid #ece8dc' }}>
              {ind}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function Card({ href, icon, title, desc, cta }: { href: string; icon: string; title: string; desc: string; cta: string }) {
  return (
    <Link
      href={href}
      className="mp-depth-card"
      style={{
        textDecoration: 'none', display: 'block', background: 'linear-gradient(165deg,#ffffff,#f8f5ec)',
        border: '1px solid #ece5d4', borderRadius: 18, padding: 26, position: 'relative', overflow: 'hidden',
        boxShadow: '0 12px 34px rgba(16,42,67,0.10), inset 0 1px 0 rgba(255,255,255,0.9)',
        transition: 'transform .18s ease, box-shadow .18s ease',
      }}
    >
      <div style={{ position: 'absolute', right: -12, top: -12, fontSize: 64, opacity: 0.07, transform: 'rotate(12deg)' }}>{icon}</div>
      <div style={{ fontSize: 30, marginBottom: 10, filter: 'drop-shadow(0 3px 8px rgba(201,168,76,0.35))' }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{title}</div>
      <div style={{ fontSize: 13.5, color: '#777', marginTop: 6, lineHeight: 1.55 }}>{desc}</div>
      <div style={{ fontSize: 13.5, color: '#0f1023', fontWeight: 800, marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#c9a84c,#b08d2e)', padding: '8px 16px', borderRadius: 9, boxShadow: '0 6px 16px rgba(201,168,76,0.35)' }}>
        {cta} →
      </div>
    </Link>
  )
}
