/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchAllIndustries, fetchMarketplaceStats, searchPublicListings, type MarketplaceStats, type PublicMarketplaceListing } from '@/lib/marketplace'
import { parseNaturalQuery } from '@/lib/naturalSearch'
import PublicListingCard from '@/components/public/PublicListingCard'
import SavedSearchAlert from '@/components/public/SavedSearchAlert'
import { formatWithCommas } from '@/components/ui/MoneyInput'
import MatchProfilePanel from '@/components/public/MatchProfilePanel'
import AutocompleteInput from '@/components/public/AutocompleteInput'
import RecentlyViewed from '@/components/public/RecentlyViewed'
import { LoadingState } from '@/components/ui'

// =============================================================================
// SearchListingsClient — interactive listing search.
// The server page pre-renders the initial grid (SSR/SEO); this client layer
// hydrates it and handles filters, natural search, alerts, and match scores.
// =============================================================================

interface Props {
  initialResults: PublicMarketplaceListing[]
  initialIndustries: string[]
  initialStats: MarketplaceStats | null
  /** Agency feed-scope (slug/domain) for white-label isolated marketplaces. */
  agencyScope?: string | null
}

export default function SearchListingsClient({ initialResults, initialIndustries, initialStats, agencyScope = null }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [results, setResults] = useState<PublicMarketplaceListing[]>(initialResults)
  const [industries, setIndustries] = useState<string[]>(initialIndustries)
  const [stats, setStats] = useState<MarketplaceStats | null>(initialStats)
  const [loading, setLoading] = useState(false)

  // filter state
  const q = searchParams.get('q') || ''
  const industry = searchParams.get('industry') || ''
  const location = searchParams.get('location') || ''
  const maxPrice = searchParams.get('maxPrice') || ''
  const maxRevenue = searchParams.get('maxRevenue') || ''
  const maxSdeMultiple = searchParams.get('maxSdeMultiple') || ''
  const absenteeOnly = searchParams.get('absenteeOnly') === '1'
  const franchiseOnly = searchParams.get('franchiseOnly') === '1'
  const financingAvailable = searchParams.get('financingAvailable') === '1'
  const sbaOnly = searchParams.get('sbaOnly') === '1'
  const status = searchParams.get('status') || ''
  const minEmployees = searchParams.get('minEmployees') || ''
  const sortBy = searchParams.get('sortBy') || ''
  const minPriceParam = searchParams.get('minPrice') || ''

  const [query, setQuery] = useState(q)
  const [selIndustry, setSelIndustry] = useState(industry)
  const [loc, setLoc] = useState(location)
  const [price, setPrice] = useState(maxPrice)
  const [rev, setRev] = useState(maxRevenue)
  const [multiple, setMultiple] = useState(maxSdeMultiple)
  const [absentee, setAbsentee] = useState(absenteeOnly)
  const [franchise, setFranchise] = useState(franchiseOnly)
  const [financing, setFinancing] = useState(financingAvailable)
  const [sba, setSba] = useState(sbaOnly)
  const [statusFilter, setStatusFilter] = useState(status)
  const [employees, setEmployees] = useState(minEmployees)
  const [advanced, setAdvanced] = useState(false)
  const [sort, setSort] = useState(sortBy)
  const [minPrice, setMinPrice] = useState(minPriceParam)

  // Refresh side panels (industries/stats) if the server didn't provide them.
  useEffect(() => {
    if (initialIndustries.length && initialStats) return
    ;(async () => {
      const [ind, st] = await Promise.all([fetchAllIndustries(agencyScope || undefined), fetchMarketplaceStats(agencyScope || undefined)])
      if (!initialIndustries.length) setIndustries(ind)
      if (!initialStats) setStats(st)
    })()
  }, [initialIndustries, initialStats])

  useEffect(() => {
    setLoading(true)
    searchPublicListings({
      query: q || undefined,
      industry: industry || undefined,
      location: location || undefined,
      minPrice: minPriceParam ? Number(minPriceParam) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      maxRevenue: maxRevenue ? Number(String(maxRevenue).replace(/[$,]/g, '')) : undefined,
      maxSdeMultiple: maxSdeMultiple ? Number(maxSdeMultiple) : undefined,
      absenteeOnly: absenteeOnly || undefined,
      franchiseOnly: franchiseOnly || undefined,
      financingAvailable: financingAvailable || undefined,
      sbaOnly: sbaOnly || undefined,
      status: (status as any) || undefined,
      minEmployees: minEmployees ? Number(minEmployees) : undefined,
      sortBy: (sortBy as any) || undefined,
    }, agencyScope || undefined).then(setResults).finally(() => setLoading(false))
  }, [q, industry, location, minPriceParam, maxPrice, maxRevenue, maxSdeMultiple, absenteeOnly, franchiseOnly, financingAvailable, sbaOnly, status, minEmployees, sortBy])

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    // Zero-token AI: parse natural language → structured filters.
    const { filters: parsed } = parseNaturalQuery(query)
    const q = parsed.query || (parsed.industry ? '' : query.trim())
    if (q) params.set('q', q)
    const industry = selIndustry || parsed.industry || ''
    if (industry) params.set('industry', industry)
    const location = loc || parsed.location || ''
    if (location) params.set('location', location)
    if (price || parsed.maxPrice) params.set('maxPrice', String(price || parsed.maxPrice))
    if (parsed.minPrice) params.set('minPrice', String(parsed.minPrice))
    if (rev || parsed.maxRevenue) params.set('maxRevenue', String(rev || parsed.maxRevenue).replace(/[$,]/g, ''))
    if (parsed.maxSdeMultiple) params.set('maxSdeMultiple', String(parsed.maxSdeMultiple))
    if (multiple) params.set('maxSdeMultiple', multiple)
    if (absentee || parsed.absenteeOnly) params.set('absenteeOnly', '1')
    if (franchise || parsed.franchiseOnly) params.set('franchiseOnly', '1')
    if (financing || parsed.financingAvailable) params.set('financingAvailable', '1')
    if (sba) params.set('sbaOnly', '1')
    if (statusFilter) params.set('status', statusFilter)
    if (employees || parsed.minEmployees) params.set('minEmployees', String(employees || parsed.minEmployees))
    if (minPrice) params.set('minPrice', String(minPrice))
    if (sort) params.set('sortBy', sort)
    router.push(`/marketplace/listings?${params.toString()}`)
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Business Marketplace</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#1a1a2e', margin: '8px 0 0' }}>
            {q || industry || location || maxPrice || maxRevenue || maxSdeMultiple || absenteeOnly || franchiseOnly || financingAvailable || sbaOnly || status || minEmployees || minPriceParam
              ? `${results.length} result${results.length !== 1 ? 's' : ''}${q ? ` for “${q}”` : ''}`
              : stats ? `${stats.totalListings} Businesses for Sale` : 'Businesses for Sale'}
          </h1>
        </div>
        <Link href="/marketplace/sell" style={{ color: '#c9a84c', textDecoration: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif' }}>→ Seller? List your business</Link>
      </header>

      {/* FILTERS */}
      <form onSubmit={applyFilters} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 18, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 700 }}>Find your business</div>
          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            style={{ background: 'none', border: '1px solid #d8d2c2', borderRadius: 99, padding: '6px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}
          >
            {advanced ? '▲ Simple view' : '▼ Advanced filters'}
          </button>
        </div>
        {/* One-tap price range chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { label: 'Under $250k', max: '250000' },
            { label: '$250k – $500k', max: '500000' },
            { label: '$500k – $1M', max: '1000000' },
            { label: '$1M+', max: '' },
          ].map((chip) => {
            const active = price === chip.max
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => setPrice(active ? '' : chip.max)}
                style={{
                  padding: '8px 16px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                  fontFamily: 'Georgia, serif',
                  background: active ? '#1a1a2e' : '#fff',
                  color: active ? '#c9a84c' : '#1a1a2e',
                  border: active ? '1px solid #1a1a2e' : '1px solid #d8d2c2',
                }}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keyword" style={inputStyle} />
          <AutocompleteInput type="category" value={selIndustry} onChange={setSelIndustry} placeholder="Category (e.g. Retail, Restaurant)…" style={{ ...inputStyle, paddingLeft: 12 }} />
          <AutocompleteInput type="location" value={loc} onChange={setLoc} placeholder="City, county, or state…" style={inputStyle} />
          <input value={price} onChange={(e) => setPrice(formatWithCommas(e.target.value))} placeholder="Max Price ($)" inputMode="decimal" style={inputStyle} />
          {advanced && (
            <>
              <input value={minPrice} onChange={(e) => setMinPrice(formatWithCommas(e.target.value))} placeholder="Min Price ($)" inputMode="decimal" style={inputStyle} />
              <input value={rev} onChange={(e) => setRev(formatWithCommas(e.target.value))} placeholder="Max Revenue ($)" inputMode="decimal" style={inputStyle} />
              <input value={multiple} onChange={(e) => setMultiple(e.target.value)} placeholder="Max SDE multiple" type="number" step="0.1" style={inputStyle} />
              <input value={employees} onChange={(e) => setEmployees(e.target.value)} placeholder="Min FT employees" type="number" style={inputStyle} />
            </>
          )}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {[
              { label: 'Absentee', checked: absentee, set: setAbsentee },
              { label: 'Franchise', checked: franchise, set: setFranchise },
              { label: 'Financing', checked: financing, set: setFinancing },
              { label: 'SBA Qualified', checked: sba, set: setSba },
            ].map((opt) => (
              <label key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#1a1a2e', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={opt.checked}
                  onChange={(e) => opt.set(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#1a1a2e', cursor: 'pointer' }}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
            <option value="">Any Status</option>
            <option value="active">Active</option>
            <option value="under_contract">Under Contract</option>
            <option value="sold">Sold</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={inputStyle}>
            <option value="">Sort: Featured first</option>
            <option value="newest">Newest</option>
            <option value="price_asc">Price: Low → High</option>
            <option value="price_desc">Price: High → Low</option>
            <option value="revenue_desc">Revenue: High → Low</option>
            <option value="multiple_desc">Multiple: High → Low</option>
          </select>
          <button type="submit" style={{ background: '#1a1a2e', color: '#fff', border: '1px solid #1a1a2e', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 14, padding: '12px 14px', letterSpacing: '0.02em', boxShadow: '0 2px 10px rgba(26,26,46,0.18)', transition: 'all .15s ease' }}>Apply Filters</button>
        </div>
      </form>

      {/* Recently viewed — cookie-based, brings buyers back */}
      <RecentlyViewed />

      {/* AI match profile — powers zero-token scores on cards */}
      <MatchProfilePanel industries={industries} />

      {/* Saved-search alerts — accountless email capture to CRM */}
      <SavedSearchAlert industry={selIndustry || industry} location={loc || location} maxPrice={price || maxPrice} />

      {/* RESULTS */}
      {loading ? <LoadingState /> : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 14px', borderRadius: '50%', background: '#f4f1e8', display: 'grid', placeItems: 'center' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>No listings match your criteria</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>Try broadening your filters or contact a broker for off-market opportunities.</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{results.length} result{results.length !== 1 ? 's' : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
            {results.map((l) => <PublicListingCard key={l.id} listing={l} />)}
          </div>
        </>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { padding: '12px 14px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 14, fontFamily: 'Inter, system-ui, -apple-system, sans-serif', outline: 'none', background: '#fff', transition: 'border-color .15s ease' }
