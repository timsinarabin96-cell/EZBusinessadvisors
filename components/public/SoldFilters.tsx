'use client'

import { useMemo, useState } from 'react'
import type { SoldListing } from '@/lib/marketplace'

const fmt$ = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

// Recently Sold — client-side filters (industry / city / search) + the card
// grid. Confidential by design: never shows names or addresses.
export default function SoldFilters({ sold }: { sold: SoldListing[] }) {
  const [industry, setIndustry] = useState('all')
  const [city, setCity] = useState('all')
  const [query, setQuery] = useState('')

  const industries = useMemo(() => {
    const set = new Set<string>()
    sold.forEach((s) => s.industry && set.add(s.industry))
    return Array.from(set).sort()
  }, [sold])

  const cities = useMemo(() => {
    const set = new Set<string>()
    sold.forEach((s) => s.location_general && set.add(s.location_general))
    return Array.from(set).sort()
  }, [sold])

  const filtered = useMemo(() => {
    return sold.filter((s) => {
      if (industry !== 'all' && s.industry !== industry) return false
      if (city !== 'all' && s.location_general !== city) return false
      if (query.trim()) {
        const q = query.toLowerCase()
        const hay = [s.industry, s.sub_industry, s.location_general].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [sold, industry, city, query])

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
    background: active ? '#1a1a2e' : '#fff', color: active ? '#fff' : '#666',
    border: active ? '1px solid #1a1a2e' : '1px solid #ece8dc',
  })

  return (
    <div>
      {/* Filters */}
      <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by industry, type, or location…"
          style={{
            padding: '11px 16px', borderRadius: 8, border: '1px solid #ece8dc', fontSize: 14,
            outline: 'none', background: '#fff', width: '100%', maxWidth: 420,
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={chipStyle(industry === 'all')} onClick={() => setIndustry('all')}>All industries</button>
          {industries.slice(0, 10).map((ind) => (
            <button key={ind} style={chipStyle(industry === ind)} onClick={() => setIndustry(industry === ind ? 'all' : ind)}>
              {ind}
            </button>
          ))}
        </div>
        {cities.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={chipStyle(city === 'all')} onClick={() => setCity('all')}>All locations</button>
            {cities.slice(0, 10).map((c) => (
              <button key={c} style={chipStyle(city === c)} onClick={() => setCity(city === c ? 'all' : c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        <div style={{ fontSize: 13, color: '#888' }}>
          Showing {filtered.length} of {sold.length} closed transactions
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>No matches for those filters</div>
          <div style={{ fontSize: 13.5, marginTop: 6 }}>Try clearing a filter or searching something broader.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {filtered.map((s) => (
            <SoldCard key={s.listing_id} sold={s} />
          ))}
        </div>
      )}
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
