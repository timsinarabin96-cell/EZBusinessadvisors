import Link from 'next/link'
import { fetchMarketplaceStats, fetchAllIndustries } from '@/lib/marketplace'
import { getPublicAgencyContext } from '@/lib/publicAgency'

// /marketplace — public marketplace home hub (replaces a bare redirect that
// broke hard navigations: 307 with no Location header).
export default async function MarketplaceHome() {
  const agency = await getPublicAgencyContext()
  const scope = agency?.scope || null
  const [stats, industries] = await Promise.all([fetchMarketplaceStats(scope), fetchAllIndustries(scope)])
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 700 }}>The Marketplace</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 40, color: '#1a1a2e', margin: '12px 0 10px' }}>Find your next business</h1>
        <p style={{ color: '#666', fontSize: 16, maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
          Browse vetted, profitable businesses for sale — or list yours confidentially and reach qualified buyers.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 40 }}>
        <Stat value={String(stats?.totalListings ?? 0)} label="Businesses for Sale" />
        <Stat value={stats?.avgAsking ? '$' + stats.avgAsking.toLocaleString() : '—'} label="Avg. Asking Price" />
        <Stat value={String(stats?.totalBusinessesSold ?? 0)} label="Businesses Sold" />
        <Stat value={String(stats?.industries ?? 0)} label="Industries" />
      </div>

      {/* Entry cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, marginBottom: 40 }}>
        <Card href="/marketplace/listings" icon="🔍" title="Buy a Business" desc="Browse active listings with full financial snapshots, filters, and SBA/financing indicators." cta="Browse listings →" />
        <Card href="/marketplace/sell" icon="💰" title="Sell a Business" desc="Get a free valuation and list your business confidentially with a dedicated broker." cta="Start selling →" />
        <Card href="/marketplace/sold" icon="✅" title="Recently Sold" desc="See real sold comps and what businesses are actually trading for in your market." cta="View sold comps →" />
        <Card href="/marketplace/professionals" icon="🤝" title="Deal Professionals" desc="Attorneys, CPAs, lenders, and consultants ready to help close your deal." cta="Find experts →" />
        <Card href="/marketplace/pocket" icon="🤫" title="Pocket Listings" desc="Off-market opportunities available exclusively through our brokers — request confidential access." cta="Explore pocket listings →" />
      </div>

      {/* Industries */}
      <div>
        <div style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>Browse by industry</div>
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '20px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

function Card({ href, icon, title, desc, cta }: { href: string; icon: string; title: string; desc: string; cta: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block', background: '#fff', border: '1px solid #ece8dc', borderRadius: 16, padding: 26, boxShadow: '0 8px 30px rgba(16,42,67,0.06)', transition: 'transform .15s ease, box-shadow .15s ease' }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{title}</div>
      <div style={{ fontSize: 13.5, color: '#777', marginTop: 6, lineHeight: 1.55 }}>{desc}</div>
      <div style={{ fontSize: 13.5, color: '#0e7490', fontWeight: 800, marginTop: 12 }}>{cta}</div>
    </Link>
  )
}
