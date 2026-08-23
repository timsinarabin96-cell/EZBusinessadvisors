'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchAllIndustries, fetchMarketplaceStats, searchPublicListings, type MarketplaceStats, type PublicMarketplaceListing } from '@/lib/marketplace'
import { parseNaturalQuery } from '@/lib/naturalSearch'
import { fmt$ } from '@/lib/recast'
import PublicListingCard from '@/components/public/PublicListingCard'
import { LoadingState } from '@/components/ui'

export default function SearchListingsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading listings..." />}>
      <SearchListingsInner />
    </Suspense>
  )
}

function SearchListingsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [results, setResults] = useState<PublicMarketplaceListing[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  const [stats, setStats] = useState<MarketplaceStats | null>(null)
  const [loading, setLoading] = useState(true)

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
  const minEmployees = searchParams.get('minEmployees') || ''

  const [query, setQuery] = useState(q)
  const [selIndustry, setSelIndustry] = useState(industry)
  const [loc, setLoc] = useState(location)
  const [price, setPrice] = useState(maxPrice)
  const [rev, setRev] = useState(maxRevenue)
  const [multiple, setMultiple] = useState(maxSdeMultiple)
  const [absentee, setAbsentee] = useState(absenteeOnly)
  const [franchise, setFranchise] = useState(franchiseOnly)
  const [financing, setFinancing] = useState(financingAvailable)
  const [employees, setEmployees] = useState(minEmployees)

  useEffect(() => {
    (async () => {
      const [ind, st] = await Promise.all([fetchAllIndustries(), fetchMarketplaceStats()])
      setIndustries(ind); setStats(st)
    })()
  }, [])

  useEffect(() => {
    setLoading(true)
    searchPublicListings({
      query: q || undefined,
      industry: industry || undefined,
      location: location || undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      maxRevenue: maxRevenue ? Number(maxRevenue) : undefined,
      maxSdeMultiple: maxSdeMultiple ? Number(maxSdeMultiple) : undefined,
      absenteeOnly: absenteeOnly || undefined,
      franchiseOnly: franchiseOnly || undefined,
      financingAvailable: financingAvailable || undefined,
      minEmployees: minEmployees ? Number(minEmployees) : undefined,
    }).then(setResults).finally(() => setLoading(false))
  }, [q, industry, location, maxPrice, maxRevenue, maxSdeMultiple, absenteeOnly, franchiseOnly, financingAvailable, minEmployees])

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
    if (rev || parsed.maxRevenue) params.set('maxRevenue', String(rev || parsed.maxRevenue))
    if (parsed.maxSdeMultiple) params.set('maxSdeMultiple', String(parsed.maxSdeMultiple))
    if (multiple) params.set('maxSdeMultiple', multiple)
    if (absentee || parsed.absenteeOnly) params.set('absenteeOnly', '1')
    if (franchise || parsed.franchiseOnly) params.set('franchiseOnly', '1')
    if (financing || parsed.financingAvailable) params.set('financingAvailable', '1')
    if (employees || parsed.minEmployees) params.set('minEmployees', String(employees || parsed.minEmployees))
    router.push(`/marketplace/listings?${params.toString()}`)
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Business Marketplace</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#1a1a2e', margin: '8px 0 0' }}>
            {stats ? `${stats.totalListings} Businesses for Sale` : 'Businesses for Sale'}
          </h1>
        </div>
        <LinkToList href="/marketplace/sell">→ Seller? List your business</LinkToList>
      </header>

      {/* FILTERS */}
      <form onSubmit={applyFilters} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 18, marginBottom: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keyword" style={inputStyle} />
        <select value={selIndustry} onChange={(e) => setSelIndustry(e.target.value)} style={inputStyle}>
          <option value="">All Industries</option>
          {industries.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Location" style={inputStyle} />
        <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Max Price ($)" type="number" style={inputStyle} />
        <input value={rev} onChange={(e) => setRev(e.target.value)} placeholder="Max Revenue ($)" type="number" style={inputStyle} />
        <input value={multiple} onChange={(e) => setMultiple(e.target.value)} placeholder="Max SDE multiple" type="number" step="0.1" style={inputStyle} />
        <input value={employees} onChange={(e) => setEmployees(e.target.value)} placeholder="Min FT employees" type="number" style={inputStyle} />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 600 }}><input type="checkbox" checked={absentee} onChange={(e) => setAbsentee(e.target.checked)} style={{ marginRight: 5 }} />🏖️ Absentee</label>
          <label style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 600 }}><input type="checkbox" checked={franchise} onChange={(e) => setFranchise(e.target.checked)} style={{ marginRight: 5 }} />🏷️ Franchise</label>
          <label style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 600 }}><input type="checkbox" checked={financing} onChange={(e) => setFinancing(e.target.checked)} style={{ marginRight: 5 }} />💰 Financing</label>
        </div>
        <button type="submit" style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 14 }}>Apply Filters</button>
      </form>

      {/* RESULTS */}
      {loading ? <LoadingState /> : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>No listings match your criteria</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>Try broadening your filters or contact a broker for off-market opportunities.</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{results.length} result{results.length !== 1 ? 's' : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {results.map((l) => <PublicListingCard key={l.id} listing={l} />)}
          </div>
        </>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { padding: '12px 14px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 14, fontFamily: 'Georgia, serif', outline: 'none', background: '#fff' }

function LinkToList({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ color: '#c9a84c', textDecoration: 'none', fontWeight: 700, fontSize: 14, fontFamily: 'Georgia, serif' }}>{children}</Link>
}
