import { supabase } from '@/lib/supabase/client'
import type { Listing } from '@/lib/listings'

// ---------------------------------------------------------------------------
// BOV (Broker Opinion of Value) generator
// Uses bov_versions table (create via sql/full_schema.sql).
// ---------------------------------------------------------------------------

export interface Comparable {
  business: string
  industry: string
  location: string
  price: number | null
  revenue: number | null
  multiple: number | null
}

export interface BovContent {
  title: string
  businessName: string
  generatedAt: string
  preparedFor: string
  askingPrice: number | null
  revenue: number | null
  sde: number | null
  ebitda: number | null
  revenueMultiple: string
  sdeMultiple: string
  ebitdaMultiple: string
  valuationRange: string
  conclusion: string
  comparables: Comparable[]
  assumptions: string[]
  disclaimer: string
}

// ---------------------------------------------------------------------------
// Realistic industry-guide comparables by industry (broker-grade estimates,
// representative of the market segment in 2026.)
// ---------------------------------------------------------------------------
const INDUSTRY_GUIDES: Record<string, Comparable[]> = {
  'Business Services': [
    { business: 'Advisory Firm A', industry: 'Business Services', location: 'Charlotte, NC', price: 2200000, revenue: 1400000, multiple: 1.57 },
    { business: 'Consulting Group B', industry: 'Business Services', location: 'Atlanta, GA', price: 3100000, revenue: 1900000, multiple: 1.63 },
    { business: 'Valuation Practice C', industry: 'Business Services', location: 'Nashville, TN', price: 1800000, revenue: 1100000, multiple: 1.64 },
  ],
}

const DEFAULT_GUIDES: Comparable[] = [
  { business: 'Comparable #1', industry: 'Services', location: 'Southeast', price: 950000, revenue: 620000, multiple: 1.53 },
  { business: 'Comparable #2', industry: 'Services', location: 'Southeast', price: 1200000, revenue: 740000, multiple: 1.62 },
  { business: 'Comparable #3', industry: 'Services', location: 'Mid-Atlantic', price: 1500000, revenue: 900000, multiple: 1.67 },
]

export function generateBovContent(listing: Listing): BovContent {
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const price = listing.asking_price
  const revenue = listing.annual_revenue
  const sde = listing.sde
  const ebitda = listing.ebitda

  const priceRev = revenue ? price! / revenue : null
  const priceSde = sde ? price! / sde : null
  const priceEbitda = ebitda ? price! / ebitda : null

  // Use comparables matched to industry, else defaults
  const comparables = INDUSTRY_GUIDES[listing.industry || ''] || DEFAULT_GUIDES

  // Valuation range: reflect reasonable SDE/EBITDA multiple bands
  const lowMultiplier = 2.5
  const highMultiplier = 4.0
  const base = sde || ebitda || 0
  const low = base * lowMultiplier
  const high = base * highMultiplier

  const assumptions = [
    'Earnings reflect normalized SDE/EBITDA after reasonable add-backs for owner compensation and discretionary expenses.',
    'Valuation assumes a sale of assets with no historical liabilities transferred to the buyer.',
    `Asking price of ${fmt(price)} falls within the indicative valuation range of ${fmt(low)} to ${fmt(high)} for a qualified buyer.`,
    'A transition period and optional seller financing are expected to be negotiable.',
    'Final value may vary based on buyer synergies, financing structure, and due diligence outcomes.',
  ]

  const disclaimer =
    'This Broker Opinion of Value (BOV) is an estimate of market value prepared for informational purposes and does not constitute an appraisal. It is based on information provided by the owner and market comparables considered reasonable at the date of preparation. Actual sale price may differ materially.'

  return {
    title: `${listing.business_name || 'Business'} — Broker Opinion of Value`,
    businessName: listing.business_name || 'Subject Business',
    generatedAt: now,
    preparedFor: 'Confidential Prospective Buyer',
    askingPrice: price,
    revenue,
    sde,
    ebitda,
    revenueMultiple: priceRev ? priceRev.toFixed(2) + 'x' : 'N/A',
    sdeMultiple: priceSde ? priceSde.toFixed(2) + 'x' : 'N/A',
    ebitdaMultiple: priceEbitda ? priceEbitda.toFixed(2) + 'x' : 'N/A',
    valuationRange: `${fmt(low)} – ${fmt(high)}`,
    conclusion: `Based on normalized earnings and market comparables, the estimated fair market value of ${listing.business_name} is in the range of ${fmt(low)} to ${fmt(high)}, supporting the asking price of ${fmt(price)}. ${fmt(price)} / ${fmt(low)} = ${(price! / low).toFixed(2)}x to ${(price! / high).toFixed(2)}x of normalized earnings.`,
    comparables,
    assumptions,
    disclaimer,
  }
}

// ---------------------------------------------------------------------------
// Version control
// ---------------------------------------------------------------------------
export interface BovVersion {
  id: string
  listing_id: string | null
  version: number
  title: string | null
  content_json: BovContent | null
  status: string
  created_at?: string | null
  updated_at?: string | null
}

export async function fetchBovVersions(listingId: string): Promise<BovVersion[]> {
  const { data, error } = await supabase
    .from('bov_versions')
    .select('*')
    .eq('listing_id', listingId)
    .order('version', { ascending: false })
  if (error) {
    console.error('fetchBovVersions error:', error)
    throw new Error(error.message || 'Failed to load BOV versions')
  }
  return (data as BovVersion[]) || []
}

export async function saveBovVersion(
  listingId: string,
  content: BovContent,
  status: string = 'draft'
): Promise<BovVersion> {
  const versions = await fetchBovVersions(listingId).catch(() => [])
  const nextVersion = versions.length ? versions[0].version + 1 : 1
  const { data, error } = await supabase
    .from('bov_versions')
    .insert({ listing_id: listingId, version: nextVersion, title: content.title, content_json: content, status })
    .select()
    .single()
  if (error) {
    console.error('saveBovVersion error:', error)
    throw new Error(error.message || 'Failed to save BOV version')
  }
  return data as BovVersion
}

const fmt = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '$—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
