import { fetchSoldListings } from '@/lib/marketplace'

// =============================================================================
// SoldCompsTicker — "Recently Sold" social-proof bar for public pages.
// Server component: fetches anonymized sold listings, renders a scrolling
// ticker. Safe on any page (SSG/SSR); crawlers see the real comps.
// =============================================================================

export default async function SoldCompsTicker({ limit = 10 }: { limit?: number }) {
  const sold = await fetchSoldListings()
  if (!sold.length) return null
  return (
    <section style={{ background: 'linear-gradient(135deg,#0f3460,#1a1a2e)', padding: '18px 0', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ color: '#c9a84c', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>
          ✅ Recently Sold
        </div>
        <div style={{ display: 'flex', gap: 28, overflowX: 'auto', scrollbarWidth: 'none', whiteSpace: 'nowrap' }}>
          {sold.slice(0, limit).map((s, i) => (
            <span key={s.listing_id + i} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13.5 }}>
              {s.industry || 'Business'} · {s.location_general || 'US'}
              {s.multiple ? ` · ${s.multiple.toFixed(1)}× SDE` : ''}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
