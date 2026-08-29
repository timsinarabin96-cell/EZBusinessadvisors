/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { SoldListing } from '@/lib/marketplace'
import { fetchFeaturedListings, fetchMarketplaceStats, fetchAllIndustries, fetchSoldListings } from '@/lib/marketplace'
import { buildSoldCompsReport } from '@/lib/soldComps'
import { getPublicAgencyContext } from '@/lib/publicAgency'
import PublicListingCard from '@/components/public/PublicListingCard'
import AuthRedirect from '@/components/public/AuthRedirect'
import ValuationLeadForm from '@/components/public/ValuationLeadForm'
import HomeSearchLocation from '@/components/public/HomeSearchLocation'
import HomeSearchCategory from '@/components/public/HomeSearchCategory'
import InstantValuation from '@/components/public/InstantValuation'
import HomeCountUp from '@/components/public/HomeCountUp'
import { CRM_LICENSE } from '@/lib/billing'
import { safeJsonLd } from '@/lib/safeJsonLd'
import { SponsoredSlot } from '@/components/public/SponsoredSlot'


// ===========================================================================
// / — advanced public homepage (Server Component). Hero with animated market
// band, live sold-deals ticker, count-up stats, smart search, instant
// valuation, featured listings, trust + sold proof, and the platform offer.
// All data is server-rendered from public_listing_feed (safe projection).
// ===========================================================================

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'
const APP_NAME = 'Concord'

export const metadata: Metadata = {
  title: `${APP_NAME} — Buy or Sell a Business`,
  description:
    'A confidential business-for-sale marketplace. Browse vetted, profitable businesses for sale, or get a free valuation to sell your business.',
  alternates: { canonical: BASE },
  openGraph: {
    title: `${APP_NAME} — Buy or Sell a Business`,
    description: 'Browse vetted, profitable businesses for sale, or get a free valuation to sell yours.',
    type: 'website',
    url: BASE,
    siteName: 'Concord Deal Platform',
    images: [{ url: `${BASE}/og-3d.png`, width: 1200, height: 630, alt: `${APP_NAME} — Buy or Sell a Business` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} — Buy or Sell a Business`,
    description: 'Confidential business-for-sale marketplace. Vetted listings, recast financials, broker-valued.',
    images: [`${BASE}/og-3d.png`],
  },
}

export default async function HomePage() {
  const agency = await getPublicAgencyContext()
  const scope = agency?.scope || null
  const [featured, stats, industries, sold, compsReport] = await Promise.all([
    fetchFeaturedListings(6, scope),
    fetchMarketplaceStats(scope),
    fetchAllIndustries(scope),
    fetchSoldListings(scope),
    buildSoldCompsReport(scope),
  ])

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    url: BASE,
    description: 'Confidential business brokerage — buy or sell an established, profitable business.',
  }
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <div>
      <AuthRedirect />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }} />

      {/* ══ HERO — premium animated band ══ */}
      <section style={{ background: 'linear-gradient(135deg,#0f1023 0%,#1a1a2e 45%,#0f3460 100%)', color: '#fff', padding: '84px 24px 72px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 60% 50% at 70% 20%, rgba(201,168,76,0.14), transparent 60%), radial-gradient(ellipse 50% 40% at 15% 80%, rgba(15,52,96,0.55), transparent 65%)' }} />
        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <div className="home-fade-up" style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 700 }}>
            Confidential Business Brokerage
          </div>
          <h1 className="home-fade-up d1" style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(32px, 5.4vw, 54px)', margin: '16px 0 14px', lineHeight: 1.12, color: '#fff' }}>
            Buy or Sell a Business<br />With <span style={{ color: '#c9a84c' }}>Confidence</span>
          </h1>
          <p className="home-fade-up d2" style={{ fontSize: 17, color: 'rgba(255,255,255,0.78)', maxWidth: 640, margin: '0 auto 34px', lineHeight: 1.6 }}>
            Concord connects qualified buyers with vetted, profitable businesses — and helps owners sell confidentially, for the right price.
          </p>

          {/* Smart search — plain GET form, zero client JS */}
          <form
            action="/marketplace/listings"
            method="GET"
            className="grid-responsive collapse-md home-fade-up d3"
            style={{
              background: '#fff', borderRadius: 14, padding: 14,
              '--grid-cols': '2fr 1.3fr 1fr auto', '--grid-gap': '10px',
              maxWidth: 840, margin: '0 auto', boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
            } as React.CSSProperties}
          >
            <input name="q" placeholder="Keyword (e.g. restaurant, HVAC, e-commerce)" style={searchInput} />
            <HomeSearchCategory style={searchInput} />
            <HomeSearchLocation style={searchInput} />
            <button type="submit" className="home-glow" style={{ background: '#1a1a2e', color: '#c9a84c', border: 'none', borderRadius: 8, padding: '0 26px', fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 14.5, cursor: 'pointer' }}>
              Search →
            </button>
          </form>

          {/* Trust chips */}
          <div className="home-fade-up d3" style={{ marginTop: 26, display: 'flex', gap: 22, justifyContent: 'center', flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
            <span>🔒 NDA-protected</span>
            <span>📊 Recast financials</span>
            <span>⚖️ Broker-valued</span>
            <span>🤝 Verified buyers</span>
          </div>

          <div style={{ marginTop: 28, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/marketplace/listings" style={ctaGold}>Browse All Listings →</Link>
            <Link href="/marketplace/sell" style={ctaGhost}>Get a Free Valuation</Link>
          </div>
        </div>
      </section>

      <SponsoredSlot slotKey="homepage_spotlight" />

      {/* ══ LIVE SOLD-DEALS TICKER — social proof marquee ══ */}
      {sold.length > 0 && (
        <section style={{ background: 'linear-gradient(90deg,#0f3460,#1a1a2e)', padding: '18px 0', overflow: 'hidden', borderTop: '1px solid rgba(201,168,76,0.25)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 18, padding: '0 24px' }}>
            <div style={{ color: '#c9a84c', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>
              ● Recently Sold
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div className="home-ticker-track">
                {[...sold.slice(0, 10), ...sold.slice(0, 10)].map((s, i) => (
                  <span key={s.listing_id + i} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13.5, whiteSpace: 'nowrap' }}>
                    ✅ {s.industry || 'Business'} · {s.location_general || 'US'}{s.multiple ? ` · ${s.multiple.toFixed(1)}× SDE` : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══ LIVE STATS — count-up ══ */}
      <section style={{ background: '#fff', borderBottom: '1px solid #ece8dc' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '30px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 22 }}>
          <HomeCountUp value={stats.totalListings} label="Businesses for Sale" />
          <HomeCountUp value={stats.totalBusinessesSold} label="Businesses Sold" />
          <HomeCountUp value={stats.industries} label="Industries" />
          <HomeCountUp value={compsReport.totals.deals} label="Closed Deals Tracked" />
        </div>
      </section>

      {/* ══ MARKET INTELLIGENCE BAND — real sold-comps averages ══ */}
      {compsReport.totals.deals > 0 && (
        <section style={{ background: '#f5f3ec', borderBottom: '1px solid #e5dfcc' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))', gap: 18, textAlign: 'center' }}>
            <MarketStat label="Closed deals tracked" value={compsReport.totals.deals.toLocaleString()} />
            <MarketStat label="Average multiple" value={compsReport.totals.avgMultiple != null ? `${compsReport.totals.avgMultiple.toFixed(2)}× SDE` : '—'} />
            <MarketStat label="Average sale price" value={compsReport.totals.avgSalePrice != null ? '$' + Math.round(compsReport.totals.avgSalePrice).toLocaleString() : '—'} />
            <MarketStat label="Industries covered" value={String(compsReport.totals.industries)} />
          </div>
        </section>
      )}

      {/* ══ FEATURED LISTINGS ══ */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Featured Opportunities</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>Recently Listed Businesses</h2>
          </div>
          <Link href="/marketplace/listings" style={{ color: '#1a1a2e', fontWeight: 700, fontFamily: 'Georgia, serif', textDecoration: 'none' }}>
            View all listings →
          </Link>
        </div>

        {/* Browse by industry — SEO entry points */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 10 }}>Browse by industry</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {industries.slice(0, 20).map((ind) => (
              <Link key={ind} href={`/marketplace/industry/${slugify(ind)}`} style={{ padding: '7px 16px', borderRadius: 99, fontSize: 13, fontWeight: 700, textDecoration: 'none', background: '#faf9f4', color: '#1a1a2e', border: '1px solid #ece8dc', transition: 'all 0.15s' }}>
                {ind}
              </Link>
            ))}
          </div>
        </div>

        {featured.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
            New listings are added regularly — check back soon, or{' '}
            <Link href="/contact" style={{ color: '#c9a84c', fontWeight: 700 }}>contact a broker</Link> about off-market opportunities.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
            {featured.map((l) => <PublicListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </section>

      {/* ══ INSTANT VALUATION + BUYER/SELLER ══ */}
      <section style={{ background: '#faf9f4', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 24 }}>
          <div style={{ display: 'grid', gap: 24, alignContent: 'start' }}>
            <CtaCard eyebrow="For Buyers" title="Find Your Next Acquisition" body="Browse a curated selection of vetted, cash-flowing businesses. Sign an NDA to unlock full financials on any listing that interests you." href="/marketplace/listings" label="Browse Businesses" />
            <CtaCard eyebrow="For Sellers" title="Sell Your Business Confidentially" body="Get a free, no-obligation valuation from a licensed business broker. We market your business discreetly to qualified buyers only." href="/marketplace/sell" label="Learn More" />
          </div>
          <div style={{ display: 'grid', gap: 24, alignContent: 'start' }}>
            <InstantValuation />
            <ValuationLeadForm />
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>How It Works</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '8px 0 0' }}>A Clear Path From Interest to Closing</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 24 }}>
          <StepCard n="1" title="Browse & Filter" body="Search by industry, location, and price. Every listing is vetted, recast, and backed by a broker opinion of value." />
          <StepCard n="2" title="Sign an NDA" body="Unlock confidential financials after a quick qualification. Your identity stays private until you're ready to move." />
          <StepCard n="3" title="Negotiate & Close" body="Work directly with an experienced broker through LOI, due diligence, and closing — with support at every step." />
        </div>
      </section>

      {/* ══ WHY CONCORD ══ */}
      <section style={{ background: '#faf9f4', padding: '56px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Why Concord</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '8px 0 0' }}>Built for Serious Transactions</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 20 }}>
            <Feature icon="🔒" title="Confidential by Default" body="Identity, location, and financials stay private until a buyer is qualified." />
            <Feature icon="📊" title="Recast Financials" body="Listings are normalized to true earning power — not what the tax return says." />
            <Feature icon="⚖️" title="Broker Opinion of Value" body="Every price is supported by market comps and professional analysis." />
            <Feature icon="🤝" title="Dedicated Brokers" body="Work with experienced intermediaries who've closed deals like yours." />
          </div>
        </div>
      </section>

      {/* ══ TRUST + SOLD PROOF ══ */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 20, marginBottom: 36 }}>
          <TrustBadge icon="🏅" title="Vetted Listings" body="Every listing passes a quality + compliance review before it goes live." />
          <TrustBadge icon="🔍" title="Verified Buyers" body="Confidential details release only after buyer qualification — no tire kickers." />
          <TrustBadge icon="📋" title="NDA-Protected" body="Your business name and address stay hidden until you approve the buyer." />
          <TrustBadge icon="🧾" title="Licensed Brokers" body="Transactions handled by licensed intermediaries with a fiduciary duty." />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>{sold.length > 0 ? 'Real closings' : 'What people say'}</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 28, color: '#1a1a2e', margin: '8px 0 0' }}>Deals That Actually Close</h2>
        </div>
        {sold.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 20 }}>
            {sold.slice(0, 3).map((s) => <SoldProofCard key={s.listing_id} s={s} />)}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 20 }}>
            <Testimonial quote="Sold my restaurant in 4 months at 95% of asking. The process was confidential start to finish — my staff never knew until the deal was done." name="Restaurant owner · Tucson, AZ" />
            <Testimonial quote="As a buyer, the pre-qualification and recast financials gave me real confidence. I knew exactly what I was getting before I ever signed an NDA." name="First-time buyer · Phoenix, AZ" />
            <Testimonial quote="The broker opinion of value beat two other appraisals. These folks know how to price a business for a real sale." name="Seller · Scottsdale, AZ" />
          </div>
        )}
      </section>

      {/* ══ FAQ — SEO + buyer/seller objections ══ */}
      <section style={{ maxWidth: 860, margin: '0 auto', padding: '56px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>FAQ</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '8px 0 0' }}>Questions, Answered</h2>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {FAQ_ITEMS.map((f) => (
            <details key={f.q} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '18px 22px' }}>
              <summary style={{ cursor: 'pointer', fontSize: 15.5, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', listStyle: 'none' }}>
                <span style={{ color: '#c9a84c', marginRight: 10 }}>▸</span>{f.q}
              </summary>
              <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7, margin: '12px 0 0', paddingLeft: 26 }}>{f.a}</p>
            </details>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontSize: 13.5, color: '#888', marginTop: 24 }}>
          Still have questions? <Link href="/contact" style={{ color: '#c9a84c', fontWeight: 700 }}>Talk to a broker</Link> — no obligation, fully confidential.
        </p>
      </section>

      {/* ══ CTA BAND ══ */}
      <section style={{ background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', color: '#fff', padding: '56px 24px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 30, margin: '0 0 10px', color: '#fff' }}>Ready to Make Your Move?</h2>
        <p style={{ color: 'rgba(255,255,255,0.75)', maxWidth: 560, margin: '0 auto 28px', fontSize: 15.5, lineHeight: 1.6 }}>
          Whether you're buying your next business or selling the one you've built — start with a free, confidential conversation.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/marketplace/listings" style={ctaGold}>Browse Listings</Link>
          <Link href="/marketplace/sell" style={ctaGhost}>Get a Free Valuation</Link>
        </div>
      </section>

      {/* ══ OWN THE CRM — platform product offer ══ */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>For Brokerages</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 32, color: '#1a1a2e', margin: '8px 0 8px' }}>Own the CRM Platform</h2>
          <p style={{ fontSize: 15, color: '#666', maxWidth: 620, margin: '0 auto', lineHeight: 1.65 }}>
            The full system behind this marketplace — deal pipeline, leads, CIM/BOV, AI agents, buyer portal, e-sign, white-label branding — on <strong>your own domain</strong>, with <strong>your own API keys</strong>.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 20, maxWidth: 900, margin: '0 auto' }}>
          <div style={{ background: '#fff', border: '2px solid #c9a84c', borderRadius: 14, padding: 30, boxShadow: '0 12px 48px rgba(201,168,76,0.18)' }}>
            <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8a6d1a', fontWeight: 800 }}>One-Time License</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 44, fontWeight: 800, color: '#1a1a2e', margin: '8px 0 2px' }}>${CRM_LICENSE.setupFee.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>+ ${CRM_LICENSE.monthly}/month platform fee</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {CRM_LICENSE.includes.map((f) => (
                <li key={f} style={{ padding: '7px 0', fontSize: 13.5, color: '#555', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#c9a84c' }}>✓</span> {f}
                </li>
              ))}
            </ul>
            <Link href="/license" style={{ display: 'block', textAlign: 'center', marginTop: 22, background: '#1a1a2e', color: '#c9a84c', padding: '13px 0', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontFamily: 'Georgia, serif' }}>
              Buy the License →
            </Link>
          </div>
          <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 14, padding: 30, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
            <div style={{ fontSize: 15, color: '#1a1a2e', lineHeight: 1.7 }}><strong>Your brand. Your domain. Your keys.</strong></div>
            <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.7 }}>
              Each licensed CRM runs on its own domain with its own DeepSeek/Claude, Supabase, and Stripe credentials — you pay only your own API usage. No shared infrastructure, no cross-tenant data.
            </div>
            <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.7 }}>
              Agents and brokers get role-based logins inside your CRM: admins control everything, brokers run deals, agents manage listings and leads.
            </div>
            <Link href="/license" style={{ color: '#1a1a2e', fontWeight: 800, fontSize: 14 }}>How licensing works →</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

/* ── helpers ── */
function TrustBadge({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#777', marginTop: 6, lineHeight: 1.55 }}>{body}</div>
    </div>
  )
}

function Testimonial({ quote, name }: { quote: string; name: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 26, boxShadow: '0 8px 24px rgba(16,42,67,0.05)' }}>
      <div style={{ fontSize: 18, color: '#c9a84c', marginBottom: 8 }}>★★★★★</div>
      <p style={{ fontSize: 14.5, color: '#444', lineHeight: 1.7, margin: '0 0 14px', fontStyle: 'italic' }}>"{quote}"</p>
      <div style={{ fontSize: 13, color: '#999', fontWeight: 700 }}>— {name}</div>
    </div>
  )
}

function SoldProofCard({ s }: { s: SoldListing }) {
  const when = s.closed_at ? new Date(s.closed_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 26, boxShadow: '0 8px 24px rgba(16,42,67,0.05)' }}>
      <div style={{ fontSize: 18, color: '#c9a84c', marginBottom: 8 }}>✅ SOLD</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{s.industry || 'Business'} · {s.location_general || 'US'}</div>
      <div style={{ fontSize: 13.5, color: '#777', marginTop: 10, lineHeight: 1.6 }}>
        {s.asking_price ? <>Listed at ${s.asking_price.toLocaleString()}</> : 'Closed confidentially'}
        {s.multiple ? <> · sold at {s.multiple.toFixed(1)}× SDE</> : ''}
        {when ? <> · {when}</> : ''}
      </div>
      <div style={{ fontSize: 12.5, color: '#c9a84c', marginTop: 12, fontWeight: 700 }}>Verified by Concord</div>
    </div>
  )
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 28, textAlign: 'center' }}>
      <div style={{ width: 44, height: 44, margin: '0 auto 14px', borderRadius: '50%', background: '#1a1a2e', color: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700 }}>{n}</div>
      <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#1a1a2e', margin: '0 0 8px' }}>{title}</h3>
      <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 24 }}>
      <div style={{ fontSize: 26, marginBottom: 10 }}>{icon}</div>
      <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 17, color: '#1a1a2e', margin: '0 0 8px' }}>{title}</h3>
      <p style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  )
}

function slugify(industry: string): string {
  return industry.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const FAQ_ITEMS = [
  {
    q: 'How do I know a listing is legit?',
    a: 'Every listing passes a quality and compliance review before going live. Financials are recast to true earning power, and each business carries a broker opinion of value backed by market comparables.',
  },
  {
    q: 'Is my identity protected as a buyer?',
    a: 'Yes. Listings display limited details until you complete a quick qualification and sign an NDA. Only then are confidential financials and the business name released — and only to qualified buyers.',
  },
  {
    q: 'Can I sell my business confidentially?',
    a: 'Absolutely. We market your business discreetly to pre-qualified buyers only. Your business name, location, and staff are never exposed until you approve a specific buyer.',
  },
  {
    q: 'What does a free valuation include?',
    a: 'A licensed broker reviews your revenue, profit, and industry position to give you a realistic market range — no obligation, fully confidential, usually within a few business days.',
  },
  {
    q: 'How does the NDA process work?',
    a: 'After you register and express interest in a listing, you complete a short buyer qualification and sign a digital NDA. Approval is typically quick, and then full financials unlock instantly.',
  },
  {
    q: 'What kinds of businesses are listed?',
    a: 'Established, cash-flowing small and mid-market businesses — from restaurants, HVAC, and e-commerce to manufacturing, healthcare services, and professional firms. New listings are added regularly.',
  },
]

function MarketStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#8a8678', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function CtaCard({ eyebrow, title, body, href, label }: { eyebrow: string; title: string; body: string; href: string; label: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 32 }}>
      <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>{eyebrow}</div>
      <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', margin: '10px 0 12px' }}>{title}</h3>
      <p style={{ fontSize: 14.5, color: '#666', lineHeight: 1.6, margin: '0 0 20px' }}>{body}</p>
      <Link href={href} style={{ display: 'inline-block', background: '#1a1a2e', color: '#fff', padding: '12px 24px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontFamily: 'Georgia, serif', fontSize: 14 }}>
        {label}
      </Link>
    </div>
  )
}

const searchInput: React.CSSProperties = {
  padding: '13px 14px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 14, fontFamily: 'Georgia, serif', outline: 'none', color: '#1a1a2e',
}
const ctaGold: React.CSSProperties = {
  background: '#c9a84c', color: '#1a1a2e', padding: '13px 26px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontFamily: 'Georgia, serif', fontSize: 14.5,
}
const ctaGhost: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '13px 26px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontFamily: 'Georgia, serif', fontSize: 14.5,
}
