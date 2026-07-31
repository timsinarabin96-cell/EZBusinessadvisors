'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { fetchMarketplaceStats, fetchFeaturedListings, fetchAllIndustries, MarketplaceStats } from '@/lib/marketplace'
import { Listing } from '@/lib/listings'
import { fmt$ } from '@/lib/recast'
import PublicListingCard from '@/components/public/PublicListingCard'
import { LoadingState } from '@/components/ui'

export default function HomePage() {
  const router = useRouter()
  const [stats, setStats] = useState<MarketplaceStats | null>(null)
  const [featured, setFeatured] = useState<Listing[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [industry, setIndustry] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [s, f, ind] = await Promise.all([fetchMarketplaceStats(), fetchFeaturedListings(6), fetchAllIndustries()])
      setStats(s); setFeatured(f); setIndustries(ind); setLoading(false)
    })()
  }, [])

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (industry) params.set('industry', industry)
    router.push(`/marketplace/listings?${params.toString()}`)
  }

  return (
    <div>
      {/* HERO */}
      <section style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #26264a 100%)', color: '#fff', padding: '90px 24px 100px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #c9a84c, #e6ce8c, #c9a84c)' }} />
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.3em', textTransform: 'uppercase', fontWeight: 700 }}>Confidential Business Marketplace</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 800, margin: '20px 0 16px', lineHeight: 1.15, color: '#fff' }}>
            Buy or Sell a <span style={{ color: '#c9a84c' }}>Profitable Business</span>
          </h1>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.75)', maxWidth: 620, margin: '0 auto 32px', lineHeight: 1.6 }}>
            Discreet, broker-led transactions for established companies. Search confidential listings or list your business for sale.
          </p>

          {/* Search bar */}
          <form onSubmit={search} style={{ display: 'flex', gap: 0, maxWidth: 640, margin: '0 auto', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by business name, industry…" style={{ flex: 2, padding: '16px 20px', border: 'none', outline: 'none', fontSize: 15, fontFamily: 'Georgia, serif' }} />
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={{ flex: 1, padding: '0 14px', border: 'none', borderLeft: '1px solid #ece8dc', outline: 'none', fontSize: 14, background: '#fff', fontFamily: 'Georgia, serif', color: '#1a1a2e' }}>
              <option value="">All Industries</option>
              {industries.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <button type="submit" style={{ background: '#c9a84c', color: '#1a1a2e', border: 'none', padding: '0 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>Search</button>
          </form>
        </div>
      </section>

      {/* STATS */}
      <section style={{ maxWidth: 1100, margin: '-50px auto 0', padding: '0 24px', position: 'relative', zIndex: 5 }}>
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, background: '#fff', borderRadius: 14, padding: '28px', boxShadow: '0 8px 40px rgba(26,26,46,0.12)', border: '1px solid #ece8dc' }}>
            <Stat label="Active Listings" value={String(stats.totalListings)} />
            <Stat label="Avg. Asking Price" value={fmt$(stats.avgAsking)} />
            <Stat label="Businesses Sold" value={String(stats.totalBusinessesSold)} />
            <Stat label="Industries Covered" value={String(stats.industries)} />
          </div>
        )}
      </section>

      {/* FEATURED */}
      <section style={{ maxWidth: 1200, margin: '60px auto 0', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Featured Opportunities</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 32, color: '#1a1a2e', margin: '8px 0 0' }}>Featured Businesses for Sale</h2>
          </div>
          <Link href="/marketplace/listings" style={{ color: '#c9a84c', textDecoration: 'none', fontWeight: 700, fontSize: 15, fontFamily: 'Georgia, serif' }}>View all listings →</Link>
        </div>

        {loading ? <LoadingState /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {featured.map((l) => <PublicListingCard key={l.id} listing={l} />)}
          </div>
        )}
        {!loading && featured.length === 0 && (
          <div style={{ textAlign: 'center', color: '#888', padding: '40px', background: '#fff', borderRadius: 12, border: '1px solid #ece8dc' }}>
            No active listings available right now. Check back soon.
          </div>
        )}
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: '#faf9f4', marginTop: 80, padding: '70px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>The Concord Process</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#1a1a2e', margin: '8px 0 0' }}>How It Works</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 28 }}>
            <HowStep n="01" title="Connect" body="Speak with a licensed Concord broker. Tell us your goals — buy, sell, or both. Everything is confidential." />
            <HowStep n="02" title="Match" body="We curate confidential listings or prepare your business with a professional valuation and CIM." />
            <HowStep n="03" title="Transition" body="Qualified buyers conduct due diligence, then close with our guidance through every step." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1100, margin: '70px auto 0', padding: '0 24px' }}>
        <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #26264a)', borderRadius: 16, padding: '50px 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, color: '#fff', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 26, margin: '0 0 8px' }}>Ready to <span style={{ color: '#c9a84c' }}>Buy</span> a Business?</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 1.6 }}>Access confidential opportunities and work directly with a dedicated broker.</p>
            <Link href="/marketplace/buy" style={{ display: 'inline-block', marginTop: 14, background: '#c9a84c', color: '#1a1a2e', padding: '12px 26px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontFamily: 'Georgia, serif' }}>Find a Business</Link>
          </div>
          <div>
            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 26, margin: '0 0 8px' }}>Ready to <span style={{ color: '#c9a84c' }}>Sell</span>?</h3>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 1.6 }}>Get a free, confidential valuation and learn what your business is truly worth.</p>
            <Link href="/marketplace/sell" style={{ display: 'inline-block', marginTop: 14, background: 'transparent', border: '2px solid #c9a84c', color: '#c9a84c', padding: '10px 26px', borderRadius: 6, textDecoration: 'none', fontWeight: 700, fontFamily: 'Georgia, serif' }}>Value My Business</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function HowStep({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ color: '#c9a84c', fontSize: 28, fontWeight: 800, fontFamily: 'Georgia, serif' }}>{n}</span>
      <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 19, color: '#1a1a2e', margin: 0 }}>{title}</h3>
      <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{body}</p>
    </div>
  )
}
