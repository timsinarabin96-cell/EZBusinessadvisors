import type { Metadata } from 'next'
import { Suspense } from 'react'
import { fetchAllIndustries, fetchMarketplaceStats, searchPublicListings } from '@/lib/marketplace'
import SearchListingsClient from '@/components/public/SearchListingsClient'
import SoldCompsTicker from '@/components/public/SoldCompsTicker'
import { LoadingState } from '@/components/ui'

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
  const sp = searchParams || {}
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''
  const bool = (v: string | string[] | undefined) => str(v) === '1'

  const [results, industries, stats] = await Promise.all([
    searchPublicListings({
      query: str(sp.q) || undefined,
      industry: str(sp.industry) || undefined,
      location: str(sp.location) || undefined,
      maxPrice: str(sp.maxPrice) ? Number(str(sp.maxPrice)) : undefined,
      maxRevenue: str(sp.maxRevenue) ? Number(str(sp.maxRevenue)) : undefined,
      maxSdeMultiple: str(sp.maxSdeMultiple) ? Number(str(sp.maxSdeMultiple)) : undefined,
      absenteeOnly: bool(sp.absenteeOnly) || undefined,
      franchiseOnly: bool(sp.franchiseOnly) || undefined,
      financingAvailable: bool(sp.financingAvailable) || undefined,
      sbaOnly: bool(sp.sbaOnly) || undefined,
      status: (str(sp.status) as any) || undefined,
      minEmployees: str(sp.minEmployees) ? Number(str(sp.minEmployees)) : undefined,
    }),
    fetchAllIndustries(),
    fetchMarketplaceStats(),
  ])

  return (
    <>
      <SoldCompsTicker limit={8} />
      <Suspense fallback={<LoadingState label="Loading listings..." />}>
        <SearchListingsClient initialResults={results} initialIndustries={industries} initialStats={stats} />
      </Suspense>
    </>
  )
}
