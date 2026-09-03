/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
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
  const stateFilter = searchParams.get('state') || ''
  const countyFilter = searchParams.get('county') || ''
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
  const minSdeParam = searchParams.get('minSde') || ''
  const maxSdeParam = searchParams.get('maxSde') || ''
  const minEbitdaParam = searchParams.get('minEbitda') || ''
  const maxEbitdaParam = searchParams.get('maxEbitda') || ''
  const minYearParam = searchParams.get('minYear') || ''
  const minRevenueParam = searchParams.get('minRevenue') || ''
  const revenueVerifiedParam = searchParams.get('revenueVerified') === '1'
  const sellerVerifiedParam = searchParams.get('sellerVerified') === '1'
  const bovOnFileParam = searchParams.get('bovOnFile') === '1'
  const relocatableParam = searchParams.get('relocatableOnly') === '1'

  const [query, setQuery] = useState(q)
  const [selIndustry, setSelIndustry] = useState(industry)
  const [loc, setLoc] = useState(location)
  const [stateSel, setStateSel] = useState(stateFilter)
  const [stateCode, setStateCode] = useState('')
  const [countySel, setCountySel] = useState(countyFilter)
  const [price, setPrice] = useState(maxPrice)
  const [rev, setRev] = useState(maxRevenue)
  const [minRev, setMinRev] = useState(minRevenueParam)
  const [multiple, setMultiple] = useState(maxSdeMultiple)
  const [absentee, setAbsentee] = useState(absenteeOnly)
  const [franchise, setFranchise] = useState(franchiseOnly)
  const [financing, setFinancing] = useState(financingAvailable)
  const [sba, setSba] = useState(sbaOnly)
  const [relocatable, setRelocatable] = useState(relocatableParam)
  const [revenueVerified, setRevenueVerified] = useState(revenueVerifiedParam)
  const [sellerVerified, setSellerVerified] = useState(sellerVerifiedParam)
  const [bovOnFile, setBovOnFile] = useState(bovOnFileParam)
  const [statusFilter, setStatusFilter] = useState(status)
  const [employees, setEmployees] = useState(minEmployees)
  const [advanced, setAdvanced] = useState(false)
  const [sort, setSort] = useState(sortBy)
  const [minPrice, setMinPrice] = useState(minPriceParam)
  const [minSde, setMinSde] = useState(minSdeParam)
  const [maxSde, setMaxSde] = useState(maxSdeParam)
  const [minEbitda, setMinEbitda] = useState(minEbitdaParam)
  const [maxEbitda, setMaxEbitda] = useState(maxEbitdaParam)
  const [minYear, setMinYear] = useState(minYearParam)

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
      state: stateFilter || undefined,
      county: countyFilter || undefined,
      minPrice: minPriceParam ? Number(minPriceParam) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      maxRevenue: maxRevenue ? Number(String(maxRevenue).replace(/[$,]/g, '')) : undefined,
      minRevenue: minRevenueParam ? Number(String(minRevenueParam).replace(/[$,]/g, '')) : undefined,
      minSde: minSdeParam ? Number(minSdeParam) : undefined,
      maxSde: maxSdeParam ? Number(maxSdeParam) : undefined,
      minEbitda: minEbitdaParam ? Number(minEbitdaParam) : undefined,
      maxEbitda: maxEbitdaParam ? Number(maxEbitdaParam) : undefined,
      minYear: minYearParam ? Number(minYearParam) : undefined,
      maxSdeMultiple: maxSdeMultiple ? Number(maxSdeMultiple) : undefined,
      absenteeOnly: absenteeOnly || undefined,
      franchiseOnly: franchiseOnly || undefined,
      financingAvailable: financingAvailable || undefined,
      relocatableOnly: relocatableParam || undefined,
      revenueVerified: revenueVerifiedParam || undefined,
      sellerVerified: sellerVerifiedParam || undefined,
      bovOnFile: bovOnFileParam || undefined,
      sbaOnly: sbaOnly || undefined,
      status: (status as any) || undefined,
      minEmployees: minEmployees ? Number(minEmployees) : undefined,
      sortBy: (sortBy as any) || undefined,
    }, agencyScope || undefined).then(setResults).finally(() => setLoading(false))
  }, [q, industry, location, stateFilter, countyFilter, minPriceParam, maxPrice, minRevenueParam, maxRevenue, minSdeParam, maxSdeParam, minEbitdaParam, maxEbitdaParam, minYearParam, maxSdeMultiple, absenteeOnly, franchiseOnly, financingAvailable, relocatableParam, revenueVerifiedParam, sellerVerifiedParam, bovOnFileParam, sbaOnly, status, minEmployees, sortBy])

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
    if (stateSel) params.set('state', stateSel)
    if (countySel) params.set('county', countySel)
    if (price === 'NONE') {
      params.set('minPrice', '1000000') // $1M+ chip = no upper bound, min $1M
    } else if (price || parsed.maxPrice) {
      params.set('maxPrice', String(price || parsed.maxPrice))
    }
    if (parsed.minPrice) params.set('minPrice', String(parsed.minPrice))
    if (minPrice) params.set('minPrice', String(minPrice))
    if (rev || parsed.maxRevenue) params.set('maxRevenue', String(rev || parsed.maxRevenue).replace(/[$,]/g, ''))
    if (minRev) params.set('minRevenue', String(minRev).replace(/[$,]/g, ''))
    if (minSde) params.set('minSde', String(minSde))
    if (maxSde) params.set('maxSde', String(maxSde))
    if (minEbitda) params.set('minEbitda', String(minEbitda))
    if (maxEbitda) params.set('maxEbitda', String(maxEbitda))
    if (minYear) params.set('minYear', String(minYear))
    if (parsed.maxSdeMultiple) params.set('maxSdeMultiple', String(parsed.maxSdeMultiple))
    if (multiple) params.set('maxSdeMultiple', multiple)
    if (absentee || parsed.absenteeOnly) params.set('absenteeOnly', '1')
    if (franchise || parsed.franchiseOnly) params.set('franchiseOnly', '1')
    if (financing || parsed.financingAvailable) params.set('financingAvailable', '1')
    if (sba) params.set('sbaOnly', '1')
    if (relocatable) params.set('relocatableOnly', '1')
    if (revenueVerified) params.set('revenueVerified', '1')
    if (sellerVerified) params.set('sellerVerified', '1')
    if (bovOnFile) params.set('bovOnFile', '1')
    if (statusFilter) params.set('status', statusFilter)
    if (employees || parsed.minEmployees) params.set('minEmployees', String(employees || parsed.minEmployees))
    if (sort) params.set('sortBy', sort)
    router.push(`/marketplace/listings?${params.toString()}`)
  }

  const clearAll = () => {
    router.push('/marketplace/listings')
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <style>{`
        .cdp-glass input, .cdp-glass select { color: #1a1a2e; }
        .cdp-glass input:focus, .cdp-glass select:focus { border-color: #c9a84c !important; box-shadow: 0 0 0 3px rgba(201,168,76,0.25) !important; outline: none; }
        .cdp-glass input::placeholder, .cdp-glass select::placeholder { color: #8a8a8a; }
        .cdp-glass select option { color: #1a1a2e; background: #fff; }
        .cdp-chip { transition: all .15s ease; }
        .cdp-chip:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(201,168,76,0.25); }
        @media (hover: none) { .cdp-chip:hover { transform: none; } }
      `}</style>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Business Marketplace</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(30px, 4vw, 44px)', color: '#1a1a2e', margin: '8px 0 0' }}>
            {q || industry || location || maxPrice || minPriceParam || maxRevenue || minRevenueParam || minSdeParam || maxSdeParam || minEbitdaParam || maxEbitdaParam || minYearParam || maxSdeMultiple || absenteeOnly || franchiseOnly || financingAvailable || sbaOnly || relocatableParam || revenueVerifiedParam || sellerVerifiedParam || bovOnFileParam || status || minEmployees || minPriceParam
              ? <>{results.length} result{results.length !== 1 ? 's' : ''}{q ? ` for “${q}”` : ''}</>
              : <><span style={{ color: '#c9a84c' }}>{stats ? stats.totalListings : '—'}</span> Businesses for Sale</>}
          </h1>
        </div>
        <Link href="/marketplace/sell" style={{ color: '#c9a84c', textDecoration: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif' }}>→ Seller? List your business</Link>
      </header>

      {/* FILTERS — premium glass card */}
      <form onSubmit={applyFilters} className="cdp-glass" style={{ background: 'linear-gradient(135deg, rgba(15,16,35,0.97), rgba(26,26,46,0.97) 55%, rgba(15,52,96,0.92))', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 18, padding: 20, marginBottom: 28, boxShadow: '0 22px 55px rgba(15,16,35,0.28), 0 0 0 1px rgba(201,168,76,0.12), inset 0 1px 0 rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 800 }}>Find your business</div>
          <button
            type="button"
            onClick={() => setAdvanced((a) => !a)}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.5)', borderRadius: 99, padding: '6px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#e0c97e', fontFamily: 'Georgia, serif' }}
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
            { label: '$1M+', max: 'NONE' }, // NONE = min price $1M (never the empty default)
          ].map((chip) => {
            // Active only when this chip is REALLY the filter — the old `price === chip.max`
            // made '$1M+' (max:'') match the empty default and highlight on every load.
            const active = chip.max === 'NONE' ? price === 'NONE' : price === chip.max
            return (
              <button
                key={chip.label}
                type="button"
                className="cdp-chip"
                onClick={() => {
                  if (chip.max === 'NONE') {
                    setPrice(price === 'NONE' ? '' : 'NONE')
                    setMinPrice(price === 'NONE' ? '' : '1000000')
                  } else {
                    setPrice(active ? '' : chip.max)
                    setMinPrice('')
                  }
                }}
                style={{
                  padding: '8px 16px', borderRadius: 99, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                  fontFamily: 'Georgia, serif',
                  background: active ? '#c9a84c' : 'rgba(255,255,255,0.06)',
                  color: active ? '#1a1a2e' : '#e0c97e',
                  border: active ? '1px solid #c9a84c' : '1px solid rgba(201,168,76,0.4)',
                }}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12 }}>
          <AutocompleteInput
            type="keyword"
            value={query}
            onChange={setQuery}
            onPick={(v) => setQuery(v)}
            placeholder="Keyword (e.g. Restaurant)…"
            style={inputStyle}
          />
          <AutocompleteInput type="category" value={selIndustry} onChange={setSelIndustry} placeholder="Category (e.g. Retail, Restaurant)…" style={{ ...inputStyle, paddingLeft: 12 }} />
          <AutocompleteInput
            type="state"
            value={stateSel}
            onChange={(v) => { setStateSel(v); setCountySel('') }}
            onPick={(v, item) => setStateCode(item?.state_code || '')}
            placeholder="State (e.g. Texas)…"
            style={inputStyle}
          />
          <AutocompleteInput type="county" value={countySel} onChange={setCountySel} stateParam={stateCode} placeholder="County / Region…" style={inputStyle} />
          <AutocompleteInput type="location" value={loc} onChange={setLoc} placeholder="City, county, or state…" style={inputStyle} />
          <input value={price} onChange={(e) => setPrice(formatWithCommas(e.target.value))} placeholder="Max Price ($)" inputMode="decimal" style={inputStyle} />
          {advanced && (
            <>
              <div style={{ fontSize: 11, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, margin: '12px 0 8px' }}>💰 Price</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 12 }}>
                <input value={minPrice} onChange={(e) => setMinPrice(formatWithCommas(e.target.value))} placeholder="Min Price ($)" inputMode="decimal" style={inputStyle} />
                <input value={price === 'NONE' ? '1,000,000' : price} onChange={(e) => { setPrice(formatWithCommas(e.target.value)); setMinPrice('') }} placeholder="Max Price ($)" inputMode="decimal" style={inputStyle} />
              </div>

              <div style={{ fontSize: 11, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, margin: '14px 0 8px' }}>📊 Financials</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12 }}>
                <input value={minRev} onChange={(e) => setMinRev(formatWithCommas(e.target.value))} placeholder="Min Revenue ($)" inputMode="decimal" style={inputStyle} />
                <input value={rev} onChange={(e) => setRev(formatWithCommas(e.target.value))} placeholder="Max Revenue ($)" inputMode="decimal" style={inputStyle} />
                <input value={minSde} onChange={(e) => setMinSde(formatWithCommas(e.target.value))} placeholder="Min SDE ($)" inputMode="decimal" style={inputStyle} />
                <input value={maxSde} onChange={(e) => setMaxSde(formatWithCommas(e.target.value))} placeholder="Max SDE ($)" inputMode="decimal" style={inputStyle} />
                <input value={minEbitda} onChange={(e) => setMinEbitda(formatWithCommas(e.target.value))} placeholder="Min EBITDA ($)" inputMode="decimal" style={inputStyle} />
                <input value={maxEbitda} onChange={(e) => setMaxEbitda(formatWithCommas(e.target.value))} placeholder="Max EBITDA ($)" inputMode="decimal" style={inputStyle} />
                <input value={multiple} onChange={(e) => setMultiple(e.target.value)} placeholder="Max SDE multiple" type="number" step="0.1" style={inputStyle} />
              </div>

              <div style={{ fontSize: 11, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, margin: '14px 0 8px' }}>🏢 Business profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 12 }}>
                <input value={minYear} onChange={(e) => setMinYear(e.target.value)} placeholder="Est. after year (e.g. 2010)" inputMode="numeric" style={inputStyle} />
                <input value={employees} onChange={(e) => setEmployees(e.target.value)} placeholder="Min FT employees" type="number" style={inputStyle} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            {[
              { label: 'Absentee', checked: absentee, set: setAbsentee },
              { label: 'Franchise', checked: franchise, set: setFranchise },
              { label: 'Financing', checked: financing, set: setFinancing },
              { label: 'SBA Qualified', checked: sba, set: setSba },
              { label: 'Relocatable', checked: relocatable, set: setRelocatable },
              { label: '✓ Revenue Verified', checked: revenueVerified, set: setRevenueVerified },
              { label: '✓ Seller Verified', checked: sellerVerified, set: setSellerVerified },
              { label: '📄 BOV on file', checked: bovOnFile, set: setBovOnFile },
            ].map((opt) => (
              <label key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'rgba(255,255,255,0.88)', fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={opt.checked}
                  onChange={(e) => opt.set(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#c9a84c', cursor: 'pointer' }}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="">Any Status</option>
              <option value="active">Active</option>
              <option value="under_contract">Under Contract</option>
              <option value="sold">Sold</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="">Sort: Featured first</option>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="revenue_desc">Revenue: High → Low</option>
              <option value="multiple_desc">Multiple: High → Low</option>
            </select>
            <button type="submit" style={{ background: '#c9a84c', color: '#1a1a2e', border: '1px solid #c9a84c', borderRadius: 8, fontWeight: 800, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 14, padding: '12px 14px', letterSpacing: '0.02em', boxShadow: '0 4px 16px rgba(201,168,76,0.35)', transition: 'all .15s ease' }}>Apply Filters</button>
            <button type="button" onClick={clearAll} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.75)', cursor: 'pointer' }}>✕ Clear all</button>
          </div>
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
