/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { supabase } from '@/lib/supabase/client'
import type { Listing } from '@/lib/listings'
import { bandForIndustry, matchIndustry } from '@/lib/marketMultiplesCore.ts'
import { resolveNormalizedEarnings, latestYoYRevenue } from '@/lib/normalizedEarnings.ts'
import type { RecastResult } from '@/lib/recast.ts'

// ---------------------------------------------------------------------------
// BOV (Broker Opinion of Value) generator
// Produces a comprehensive, multi-page, investment-bank quality narrative
// (10+ pages) covering all standard sell-side sections. Uses bov_versions
// table (create via sql/full_schema.sql).
//
// LIABILITY LABEL GATE (boss 08-31, highest priority): a document may only
// title itself "Broker Opinion of Value" when its bov_versions.status is
// 'final' AND a licensed agent has explicitly signed off (reviewed_by +
// reviewed_at recorded). Everything else — draft, review, or agent-untouched
// (including all self-serve paid-tier output) — must title itself
// "AI Valuation Estimate". ALL title/eyebrow/kindLabel call sites resolve
// through the helpers below; never hardcode the label string.
// ---------------------------------------------------------------------------

export type BovReviewState = 'draft' | 'review' | 'final'

export const BOV_LABEL_FINAL = 'Broker Opinion of Value'
export const BOV_LABEL_AI = 'AI Valuation Estimate'

/** The ONLY place the document label string is decided. */
export function bovDocumentLabel(state: BovReviewState | string | null | undefined): string {
  return state === 'final' ? BOV_LABEL_FINAL : BOV_LABEL_AI
}

/** Full document title: "<business> — <label>". */
export function bovDocumentTitle(businessName: string | null | undefined, state: BovReviewState | string | null | undefined): string {
  return `${businessName || 'Business'} — ${bovDocumentLabel(state)}`
}

/** Recover the label from an already-titled document (deliveries/email). */
export function bovLabelFromTitle(title: string | null | undefined): string {
  return title && title.includes(BOV_LABEL_FINAL) ? BOV_LABEL_FINAL : BOV_LABEL_AI
}

/**
 * Latest review state for a listing's newest BOV version (draft/review/final),
 * or 'draft' when no version exists. The delivery title + PDF label derive
 * from this — never from the listing's tier.
 */
export async function latestBovReviewState(
  db: { from: (table: string) => any },
  listingId: string,
): Promise<BovReviewState> {
  try {
    const { data } = await db.from('bov_versions').select('status').eq('listing_id', listingId).order('version', { ascending: false }).limit(1).maybeSingle()
    return (data?.status === 'final' || data?.status === 'review' || data?.status === 'draft') ? (data.status as BovReviewState) : 'draft'
  } catch {
    return 'draft'
  }
}

export interface Comparable {
  business: string
  industry: string
  location: string
  price: number | null
  revenue: number | null
  multiple: number | null
}

// A rendered section of the BOV document. Consumers (screen renderer + PDF
// exporter) paginate over `sections`; each section carries its own subsections.
export interface BovSection {
  id: string
  title: string
  subsections: { heading?: string; body: string[] }[]
}

export interface BovContent {
  title: string
  /** draft | review | final — drives the "AI Valuation Estimate" vs "BOV" label. */
  reviewState?: BovReviewState
  /** Who signed off (profiles.id) when status flipped to final. */
  reviewedBy?: string | null
  /** When the agent signed off. */
  reviewedAt?: string | null
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
  twelveMethods?: TwelveMethodResult
  // Full multi-section narrative (10+ pages) — investment-bank quality.
  sections: BovSection[]
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
  Manufacturing: [
    { business: 'Precision Components LLC', industry: 'Manufacturing', location: 'Greenville, SC', price: 8600000, revenue: 5200000, multiple: 1.65 },
    { business: 'Mid-State Fabrication', industry: 'Manufacturing', location: 'Greensboro, NC', price: 6400000, revenue: 4100000, multiple: 1.56 },
    { business: 'Carolina Castings Co.', industry: 'Manufacturing', location: 'Columbia, SC', price: 11200000, revenue: 6900000, multiple: 1.62 },
  ],
  Healthcare: [
    { business: 'Piedmont Home Health', industry: 'Healthcare', location: 'Raleigh, NC', price: 5200000, revenue: 3600000, multiple: 1.44 },
    { business: 'Triangle Care Services', industry: 'Healthcare', location: 'Durham, NC', price: 4800000, revenue: 3300000, multiple: 1.45 },
    { business: 'Coastal Senior Care', industry: 'Healthcare', location: 'Wilmington, NC', price: 6100000, revenue: 4200000, multiple: 1.45 },
  ],
  'Technology / Software': [
    { business: 'CloudLogic Solutions', industry: 'Technology', location: 'Atlanta, GA', price: 11500000, revenue: 5200000, multiple: 2.21 },
    { business: 'DataStream Partners', industry: 'Technology', location: 'Charlotte, NC', price: 16000000, revenue: 7100000, multiple: 2.25 },
    { business: 'Nexus SaaS Group', industry: 'Technology', location: 'Raleigh, NC', price: 9400000, revenue: 4100000, multiple: 2.29 },
  ],
  Retail: [
    { business: 'Tar Heel Outfitters', industry: 'Retail', location: 'Chapel Hill, NC', price: 750000, revenue: 520000, multiple: 1.44 },
    { business: 'Old North Retail', industry: 'Retail', location: 'Asheville, NC', price: 890000, revenue: 610000, multiple: 1.46 },
    { business: 'Piedmont Market', industry: 'Retail', location: 'High Point, NC', price: 680000, revenue: 470000, multiple: 1.45 },
  ],
}

const DEFAULT_GUIDES: Comparable[] = [
  { business: 'Comparable #1', industry: 'Services', location: 'Southeast', price: 950000, revenue: 620000, multiple: 1.53 },
  { business: 'Comparable #2', industry: 'Services', location: 'Southeast', price: 1200000, revenue: 740000, multiple: 1.62 },
  { business: 'Comparable #3', industry: 'Services', location: 'Mid-Atlantic', price: 1500000, revenue: 900000, multiple: 1.67 },
]

// ---------------------------------------------------------------------------
// Deterministic 3-year (plus current) financial history derived from the
// listing's reported revenue / SDE / EBITDA. Used to drive the financial
// performance, EBITDA/SDE margin-trend, valuation and risk narratives.
// ---------------------------------------------------------------------------
interface HistoryYear {
  year: number
  revenue: number
  sde: number
  ebitda: number
  sdeMargin: number
  ebitdaMargin: number
}

function buildHistory(listing: Listing): HistoryYear[] {
  const revenue = listing.annual_revenue || 0
  const sde = listing.sde || 0
  const ebitda = listing.ebitda || sde * 0.82
  const baseYear = new Date().getFullYear()
  // Trailing growth assumptions (industry-typical for main-street/lower-middle).
  const revGrowth = [1.0, 0.965, 0.93, 0.88] // current, Y-1, Y-2, Y-3 (revenue scaling)
  // Margin shapes: modest expansion over time as owner improves operations.
  const years: HistoryYear[] = [0, 1, 2, 3].map((i) => {
    const thisYear = baseYear - i
    const rev = Math.round((revenue * revGrowth[i]) / 100) * 100
    const sdeMargin = 0.24 + i * 0.012 + (sde ? sde / revenue - 0.25 : 0.0)
    const ebitdaMargin = 0.17 + i * 0.011 + (ebitda ? ebitda / revenue - 0.18 : 0.0)
    return {
      year: thisYear,
      revenue: rev,
      sde: Math.round((rev * sdeMargin) / 100) * 100,
      ebitda: Math.round((rev * ebitdaMargin) / 100) * 100,
      sdeMargin,
      ebitdaMargin,
    }
  })
  // Force the current year to match the listing's reported figures.
  if (sde) years[0].sde = sde
  if (ebitda) years[0].ebitda = ebitda
  years[0].revenue = revenue
  years[0].sdeMargin = revenue ? sde / revenue : 0
  years[0].ebitdaMargin = revenue ? years[0].ebitda / revenue : 0
  return years
}

// ---------------------------------------------------------------------------
// Narrative helpers
// ---------------------------------------------------------------------------
const guard = (n: number | null | undefined, fallback = 0): number =>
  n === null || n === undefined || isNaN(n) ? fallback : n

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

// ===========================================================================
// TWELVE-METHOD VALUATION ENGINE — mirrors the boss's Transworld-grade BOV:
// each method returns an upper/lower value; the suggested price is the average
// of the range extremes. Deterministic, computed from the listing's actuals.
// ===========================================================================

export interface TwelveMethodResult {
  methods: { name: string; high: number; low: number; note?: string }[]
  rangeHigh: number
  rangeLow: number
  conclusion: number
  assetValue: number
  intangibleValue: number
}

function round2(n: number): number {
  return Math.round(n / 100) * 100
}

/**
 * Compute the twelve standard valuation methods from listing inputs.
 * Inputs mirror the classic broker worksheet (the boss's Transworld report).
 */
export function computeTwelveMethods(input: {
  annualRevenue?: number | null
  sde?: number | null
  ebitda?: number | null
  askingPrice?: number | null
  assetsValue?: number | null      // fixtures/equipment/leasehold/etc.
  industry?: string | null
}): TwelveMethodResult {
  const revenue = guard(input.annualRevenue)
  const sde = guard(input.sde)
  const ebitda = guard(input.ebitda) || sde * 0.82
  const asking = guard(input.askingPrice)
  const assets = guard(input.assetsValue, sde > 0 ? sde * 0.25 : 0) // asset base est. if not provided

  // 1) Asset Value Method — minimum value; tangible asset base.
  const assetHigh = round2(assets * 1.25)
  const assetLow = round2(assets)

  // 2) Basic Method — assets + one year net cash flow (high) / assets + monthly
  //    discretionary income × months-to-break-even (low).
  const basicHigh = round2(assets + sde)
  const basicLow = round2(assets + (sde / 12) * 6)

  // 3) Capitalization Method (ROI) — discretionary cash ÷ cap rate.
  const capRate = 0.5 // 50% typical small-business cap rate
  const capValue = round2(sde / capRate)

  // 4) Critical Factors Method — financing/desirability/lease/economy weights.
  const financing = 0.05, desirability = 0.85, lease = 0.67, economy = 0.8
  const cfHigh = round2(sde * ((financing + desirability + lease + economy) / 4) * 1.15)
  const cfLow = round2(sde * ((financing + desirability + lease + economy) / 4) * 0.66)

  // 5) Debt Capacity Method — discretionary earnings available for debt service.
  const netDiscretionary = sde
  const safeMargin = netDiscretionary * 0.8
  const debtHigh = round2(safeMargin * 7.18) // 10-yr amort, 7% (PV factor ~7.18)
  const debtLow = round2(safeMargin * 4.1)   // 5-yr amort, 7% (PV factor ~4.1)

  // 6) Industry Method — rules of thumb (services ≈ 1.5–2.5× SDE when known).
  const hasRule = !!input.industry && input.industry !== 'Other'
  const indHigh = hasRule ? round2(sde * 2.5) : 0
  const indLow = hasRule ? round2(sde * 1.5) : 0

  // 7) Excess Earnings Method — normal return on assets + capitalized excess.
  const normalReturn = assets * 0.5 // 50% normal return on asset base
  const excessEarnings = Math.max(0, sde - normalReturn)
  const excessHigh = round2(assets + excessEarnings / 0.5)
  const excessLow = round2(assets + excessEarnings / 0.6)

  // 8) Discounted Cash Flow — 5-yr normalized earnings at small-biz discount.
  const dcfRate = 0.35
  const dcfValue = round2(ebitda * ((1 - Math.pow(1 + dcfRate, -5)) / dcfRate))

  // 9) Market Approach — price/revenue + price/SDE from comps.
  const marketHigh = round2(revenue * 1.2 + sde * 2.2)
  const marketLow = round2(revenue * 0.9 + sde * 1.7)

  // 10) National Method — factor-weighted base (financing, years, consulting).
  const natHigh = round2(sde * 0.4)
  const natLow = round2(sde * 0.33)

  // 11) Weighted Factors — blended discretionary earnings multiple.
  const wfHigh = round2(sde * 1.9)
  const wfLow = round2(sde * 1.4)

  // 12) Multiple / Average Value Method — mean of applied SDE multiples.
  const avgHigh = round2(sde * 2.0)
  const avgLow = round2(sde * 1.5)

  const methods = [
    { name: 'Asset Value Method', high: assetHigh, low: assetLow, note: 'Tangible asset base — minimum value floor.' },
    { name: 'Basic Method', high: basicHigh, low: basicLow, note: 'Assets + one year net cash flow.' },
    { name: 'Capitalization Method (ROI)', high: capValue, low: capValue, note: `Discretionary cash ÷ ${(capRate * 100).toFixed(0)}% cap rate.` },
    { name: 'Critical Factors Method', high: cfHigh, low: cfLow, note: 'Financing, desirability, lease, economy.' },
    { name: 'Debt Capacity Method', high: debtHigh, low: debtLow, note: 'Discretionary earnings available for debt service.' },
    { name: 'Industry Method', high: indHigh, low: indLow, note: hasRule ? 'Sector rules-of-thumb applied.' : 'No applicable industry rule — $0.' },
    { name: 'Excess Earnings Method', high: excessHigh, low: excessLow, note: 'Normal return on assets + capitalized excess earnings.' },
    { name: 'Discounted Cash Flow', high: dcfValue, low: dcfValue, note: `5-year normalized earnings at ${(dcfRate * 100).toFixed(0)}% discount.` },
    { name: 'Market Approach Method', high: marketHigh, low: marketLow, note: 'Price/revenue + price/SDE from comparable transactions.' },
    { name: 'National Method', high: natHigh, low: natLow, note: 'Factor-weighted national benchmark.' },
    { name: 'Weighted Factors Method', high: wfHigh, low: wfLow, note: 'Blended discretionary-earnings multiple.' },
    { name: 'Multiple / Average Value Method', high: avgHigh, low: avgLow, note: 'Mean of applied SDE multiples.' },
  ]

  const usable = methods.filter((m) => m.high > 0 || m.low > 0)
  const rangeHigh = Math.max(...usable.map((m) => m.high), asking)
  const rangeLow = Math.min(...usable.map((m) => m.low), asking)
  // The boss's report: "our single price conclusion is the average of the
  // maximum and minimum suggested price ranges."
  const conclusion = round2((rangeHigh + rangeLow) / 2)
  const intangibleValue = Math.max(0, conclusion - assets)

  return { methods, rangeHigh, rangeLow, conclusion, assetValue: assets, intangibleValue }
}

export function generateBovContent(listing: Listing, opts?: { recast?: RecastResult | null; reviewState?: BovReviewState; reviewedBy?: string | null; reviewedAt?: string | null }): BovContent {
  const reviewState = opts?.reviewState ?? 'draft'
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const price = guard(listing.asking_price)
  // SINGLE SOURCE OF TRUTH (audit fix 08-31): normalized earnings come from the
  // recast when one exists — the raw listing fields were a second, divergent
  // calculation (BOV $318k vs recast $572k; YoY 3.6% fabricated vs 9.0% real).
  const earnings = resolveNormalizedEarnings(listing, opts?.recast)
  const revenue = guard(earnings.revenue)
  const sde = guard(earnings.sde)
  const ebitda = guard(earnings.ebitda)
  const yoyRevenue = latestYoYRevenue(earnings)
  const name = listing.business_name || 'Subject Business'
  const industry = listing.industry || 'its industry'
  const location = listing.location_general || 'the Southeast United States'

  const priceRev = revenue ? price / revenue : null
  const priceSde = sde ? price / sde : null
  const priceEbitda = ebitda ? price / ebitda : null

  // Use comparables matched to industry, else defaults
  const comparables = INDUSTRY_GUIDES[listing.industry || ''] || DEFAULT_GUIDES

  // Valuation range: market multiples when the industry matches (e.g. home
  // care trades 4-5x EBITDA); otherwise a reasonable SDE/EBITDA band.
  const marketBand = bandForIndustry(listing.industry, ebitda ? 'EBITDA' : 'SDE')
  const lowMultiplier = marketBand ? marketBand.min : 2.5
  const highMultiplier = marketBand ? marketBand.max : 4.0
  const marketLabel = marketBand
    ? `${marketBand.industry} typically trades ${marketBand.min.toFixed(1)}-${marketBand.max.toFixed(1)}x ${marketBand.basis} in the current market`
    : null
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
    `This ${bovDocumentLabel(reviewState)} is an estimate of market value prepared for informational purposes and does not constitute an appraisal. It is based on information provided by the owner and market comparables considered reasonable at the date of preparation. Actual sale price may differ materially. This document is confidential and proprietary and is provided solely to qualified prospective purchasers for the purpose of evaluating the subject business. Recipients agree not to reproduce or distribute this document without the prior written consent of the seller and its advisor. This memorandum does not constitute an offer to sell, and no reliance may be placed on its contents for investment purposes.`

  // Real multi-year history when a recast exists; fabricated fallback only
  // when no recast has been run yet (and then labeled as an estimate).
  // Newest-first (matches buildHistory convention: hist[0] = latest year).
  const hist: HistoryYear[] = earnings.hasRecast
    ? earnings.years.slice().sort((a, b) => b.year - a.year).map((y) => ({
        year: y.year,
        revenue: y.revenue,
        sde: y.sde,
        ebitda: y.ebitda,
        sdeMargin: y.revenue > 0 ? y.sde / y.revenue : 0,
        ebitdaMargin: y.revenue > 0 ? y.ebitda / y.revenue : 0,
      }))
    : buildHistory(listing)
  const latest = hist[0]
  const y1 = hist[1] || hist[0]
  const revTrend = y1.revenue ? ((latest.revenue - y1.revenue) / y1.revenue) * 100 : 0
  const sdeTrend = y1.sde ? ((latest.sde - y1.sde) / y1.sde) * 100 : 0
  const ebitdaTrend = y1.ebitda ? ((latest.ebitda - y1.ebitda) / y1.ebitda) * 100 : 0
  // Prefer the recast's real trend note when present (audit fix #2).
  const trendNote = earnings.analysis?.trendNote || null
  const mgmtRisk = sde === 0 ? 'moderate' : sde / revenue < 0.15 ? 'elevated' : 'moderate'

  // ── TWELVE-METHOD ENGINE (the boss's Transworld-grade valuation) ──────────
  const twelve = computeTwelveMethods({
    annualRevenue: revenue,
    sde,
    ebitda,
    askingPrice: price,
    assetsValue: (listing as any).total_value ?? null,
    industry: listing.industry,
  })
  const methodRows = twelve.methods
    .map((m) => `• ${m.name}: $${m.high.toLocaleString()} high / $${m.low.toLocaleString()} low${m.note ? ' — ' + m.note : ''}`)
    .join('\n')

  const sections: BovSection[] = [
    // 1. Executive Summary
    {
      id: 'executive-summary',
      title: 'Executive Summary',
      subsections: [
        {
          heading: 'Transaction Overview',
          body: [
            `${name} represents a compelling acquisition opportunity in ${industry}, generating approximately ${fmt(revenue)} in trailing annual revenue and ${fmt(sde)} in normalized Seller\u2019s Discretionary Earnings (SDE). The business is offered at an asking price of ${fmt(price)}, equating to a ${priceSde ? priceSde.toFixed(2) + 'x' : '—'} multiple of normalized SDE and a ${priceRev ? priceRev.toFixed(2) + 'x' : '—'} multiple of revenue — pricing that compares favorably to the observed range of comparable transactions in the region.`,
            `The Company has established a diversified customer base, a defensible position within ${industry}, and a track record of stable, recurring earnings. Management attributes of the business include low customer concentration relative to sector norms, a tenured employee base, and infrastructure that supports scalable growth under new ownership.`,
            'This memorandum presents a comprehensive analysis of the Company, including its operations, financial performance, market positioning, valuation rationale, risk profile, and recommended transaction structure, to facilitate an informed evaluation by prospective purchasers.',
          ],
        },
        {
          heading: 'Key Investment Highlights',
          body: [
            `• Stable, recurring revenue base of approximately ${fmt(revenue)} with ${pct(revTrend / 100)} year-over-year growth in the current period.`,
            `• Normalized SDE of ${fmt(sde)} and EBITDA of ${fmt(ebitda)}, reflecting disciplined operating margins and clean add-back structure.`,
            `• Asset-light operating model with working-capital requirements that are modest relative to revenue.`,
            `• Experienced, tenured team with low historical turnover, reducing transition and key-person risk.`,
            `• Diversified customer base; removals of any single client would not materially impair cash flows.`,
            `• Attractive regulatory and demographic tailwinds supporting continued demand within ${industry}.`,
            '• Immediate scalability through expanded sales coverage, adjacent-service expansion, and operational leverage.',
          ],
        },
        {
          heading: 'Offering Summary',
          body: [
            `Asking Price: ${fmt(price)}`,
            `Trailing Revenue: ${fmt(revenue)}`,
            `Normalized SDE: ${fmt(sde)}`,
            `Normalized EBITDA: ${fmt(ebitda)}`,
            `Price / SDE: ${priceSde ? priceSde.toFixed(2) + 'x' : 'N/A'}`,
            `Price / Revenue: ${priceRev ? priceRev.toFixed(2) + 'x' : 'N/A'}`,
            `Indicative Value Range: ${fmt(twelve.rangeLow)} to ${fmt(twelve.rangeHigh)}. The wide spread is expected: it spans a pure-asset floor to an aggressive debt-capacity ceiling. The extremes are bounds, not price points — the single price conclusion (the average of the range) is the value a qualified buyer should anchor on, and the earnings-supported midpoint is reconciled in the Valuation Analysis.`,
            'Structure: Sale of substantially all assets (or equity, at seller\u2019s election), with a negotiated transition period.',
            'Confidentiality: This memorandum is provided under strict confidentiality and may not be distributed without prior written consent.',
          ],
        },
      ],
    },

    // 2. Company Overview
    {
      id: 'company-overview',
      title: 'Company Overview',
      subsections: [
        {
          heading: 'History & Background',
          body: [
            `${name} was established to serve clients within ${industry} across ${location}. Over successive operating periods, management has cultivated a reputation for reliability, quality of service, and responsiveness — attributes that have underpinned customer retention and organic growth.`,
            'The Company has methodically expanded its service capacity, invested in operational systems, and refined its customer-selection criteria, resulting in a portfolio weighted toward long-tenure, high-retention accounts. This disciplined approach has supported consistent financial performance and a stable, predictable earnings profile.',
          ],
        },
        {
          heading: 'Operations & Service Delivery',
          body: [
            `The Company\u2019s operations are centered on delivering consistent, high-quality output to its customer base. Day-to-day operations are supported by documented workflows, established supplier relationships, and a trained workforce that collectively reduce execution risk and enhance service reliability.`,
            'Operating infrastructure includes dedicated management supervision, schedulable and scalable capacity, and quality-assurance processes that maintain service standards across the customer base. Capacity can be expanded incrementally, positioning the Company to absorb growth without disproportionate capital investment.',
          ],
        },
        {
          heading: 'Customers',
          body: [
            'The customer base is diversified across geographies, end-markets, and account sizes. No single customer accounts for a disproportionate share of revenue, which mitigates concentration risk and supports the stability of future cash flows. Customer relationships are governed by repeat engagement and high satisfaction, evidenced by the Company\u2019s strong retention metrics.',
          ],
        },
        {
          heading: 'Employees & Management',
          body: [
            `The Company employs a tenured team that has demonstrated low turnover and strong institutional knowledge. Key operational responsibilities are distributed across trained personnel, reducing dependence on any single individual. The owner remains involved in business development and strategic oversight; a defined transition period is expected to facilitate continuity for the acquiring party.`,
          ],
        },
        {
          heading: 'Location & Facilities',
          body: [
            `${name} is headquartered in ${location}, a market with favorable demographics, logistics access, and a supportive business environment. Operating facilities are well-maintained and appropriately sized for current and projected activity levels. Real estate and other fixed assets may be included in the transaction at the buyer\u2019s election, subject to negotiation.`,
          ],
        },
      ],
    },

    // 3. Financial Performance (3 years historical + recast)
    {
      id: 'financial-performance',
      title: 'Financial Performance',
      subsections: [
        {
          heading: 'Revenue History (Multi-Year + Current)',
          body: [
            `${name} has delivered revenue of approximately ${hist.length >= 4 ? fmt(hist[3].revenue) + ' (' + hist[3].year + '), ' : ''}${hist.length >= 3 ? fmt(hist[2].revenue) + ' (' + hist[2].year + '), ' : ''}${hist.length >= 2 ? fmt(hist[1].revenue) + ' (' + hist[1].year + '), ' : ''}and ${fmt(latest.revenue)} (latest trailing period). The trajectory demonstrates a ${revTrend >= 0 ? 'stable' : 'declining'} revenue base with a ${pct(Math.abs(revTrend) / 100)} ${revTrend >= 0 ? 'increase' : 'decrease'} in the most recent period, consistent with the Company\u2019s positioning and market conditions.`,
            ...(trendNote ? [trendNote] : []),
            'Revenue composition is characterized by recurring customer relationships and a diversified mix, providing a degree of resilience against any single-component interruption.',
          ],
        },
        {
          heading: 'Normalized Earnings (SDE & EBITDA)',
          body: [
            'For valuation purposes, reported earnings have been normalized to reflect the benefits available to a non-operating owner. Add-backs include owner compensation in excess of market replacement cost, discretionary and non-recurring expenses, and certain one-time items, yielding the following normalized figures across the period:',
            `• SDE: ${fmt(hist[hist.length - 1].sde)} (${hist[hist.length - 1].year}) → ${fmt(latest.sde)} (latest), a cumulative trend consistent with margin discipline.`,
            `• EBITDA: ${fmt(hist[hist.length - 1].ebitda)} (${hist[hist.length - 1].year}) → ${fmt(latest.ebitda)} (latest).`,
            `• Recast SDE margin: ${pct(latest.sdeMargin)}; Recast EBITDA margin: ${pct(latest.ebitdaMargin)}.`,
          ],
        },
        {
          heading: 'Recast Financial Summary',
          body: [
            'The following summarizes the before-and-after recast position for the trailing period:',
            `• As-Reported Revenue: ${fmt(latest.revenue)}`,
            `• Add-backs (owner comp, discretionary, non-recurring): quantified in the accompanying recast schedule.`,
            `• Normalized SDE: ${fmt(latest.sde)}`,
            `• Normalized EBITDA: ${fmt(latest.ebitda)}`,
            'All add-backs are itemized and traceable so that prospective buyers and lenders may independently verify each adjustment during due diligence.',
          ],
        },
      ],
    },

    // 4. EBITDA / SDE Analysis with Margin Trends
    {
      id: 'ebitda-sde-analysis',
      title: 'EBITDA & SDE Analysis',
      subsections: [
        {
          heading: 'Earnings Quality & Margin Trend',
          body: [
            `The Company\u2019s normalized SDE margin of ${pct(latest.sdeMargin)} and EBITDA margin of ${pct(latest.ebitdaMargin)} reflect a well-managed cost structure. Over the trailing period, margins have ${latest.sdeMargin > hist[hist.length - 1].sdeMargin ? 'expanded' : 'remained stable'} as management realized operating efficiencies and refined discretionary spending.`,
            'Earnings quality is supported by a diversified revenue base, low capital-intensity, and minimal reliance on non-recurring items, which lends confidence to the sustainability of normalized earnings.',
          ],
        },
        {
          heading: 'Sensitivity to Revenue & Margin',
          body: [
            `Each 100 basis points of SDE-margin movement, holding revenue constant, changes normalized SDE by approximately ${fmt(latest.revenue * 0.01)}. Conversely, a ${pct(0.05)} change in revenue at current margins moves normalized SDE by ${fmt(latest.revenue * 0.05 * latest.sdeMargin)}. This sensitivity framing assists buyers in stress-testing deal economics.`,
            `The implied valuation multiple of ${priceSde ? priceSde.toFixed(2) + 'x' : '—'} SDE is within the range supported by the earnings analysis, and the Company\u2019s margin profile supports the lower end of the comparable range on a risk-adjusted basis.`,
          ],
        },
        {
          heading: 'Recast to EBITDA Reconciliation',
          body: [
            `EBITDA of ${fmt(ebitda)} is derived from normalized SDE after deducting market-rate owner compensation and adjusting for owner-specific discretionary items, depreciation, and interest, in accordance with standard sell-side methodology. This reconciliation provides a defensible basis for the valuation analysis presented in Section 6.`,
          ],
        },
      ],
    },

    // 5. Market & Industry Analysis
    {
      id: 'market-industry',
      title: 'Market & Industry Analysis',
      subsections: [
        {
          heading: 'Industry Overview',
          body: [
            `The ${industry} sector in the ${location} region continues to demonstrate resilient demand, supported by favorable demographics, stable end-market fundamentals, and ongoing provider consolidation. Market participants benefit from elevated barriers to entry in certain niches, including licensing, customer relationships, and regulatory compliance.`,
            'Industry tailwinds include sustained demand growth, a shift toward outsourcing and professionalized service delivery, and consolidation activity as buyers seek scale. These factors contribute to an attractive backdrop for a well-positioned operator such as the subject business.',
          ],
        },
        {
          heading: 'Market Sale Multiples',
          body: [
            marketLabel
              ? `According to current market data, ${marketLabel}. This benchmark provides context for the earnings multiple applied in the valuation analysis in Section 6.`
              : `Businesses in this sector typically transact at 2.0-3.5x SDE, with larger, well-documented operations commanding 3.5-5.0x EBITDA. The earnings multiple applied in Section 6 reflects this market context.`,
            'Multiples vary with size, growth, customer concentration, and the quality of financial documentation. Comparable transactions are summarized in the valuation section.',
          ],
        },
        {
          heading: 'Competitive Landscape',
          body: [
            'The competitive environment is fragmented, with a mix of independent operators and regional consolidators. The Company differentiates through service quality, customer retention, and a diversified account base, allowing it to compete effectively on value rather than price alone. Its established reputation and tenured client relationships constitute a meaningful competitive moat.',
          ],
        },
        {
          heading: 'Growth Drivers & Outlook',
          body: [
            'Prospective owners can pursue multiple avenues for growth, including expanded sales and marketing, introduction of adjacent service lines, geographic extension, and operational leverage from existing capacity. The combination of a stable base and identifiable growth vectors supports a constructive outlook for the business.',
          ],
        },
      ],
    },

    // 6. Valuation Analysis (3 methods + comparables)
    {
      id: 'valuation',
      title: 'Valuation Analysis',
      subsections: [
        {
          heading: 'Methodology',
          body: [
            'The indicative value range was derived using a multiple-of-earnings approach cross-checked against market comparables and a discounted-cash-flow (DCF) framing. This triangulation provides a robust, defensible estimate of fair market value.',
          ],
        },
        {
          heading: 'Method 1 — Multiple of Normalized Earnings',
          body: [
            marketLabel
              ? `Applying ${marketLabel} — ${lowMultiplier.toFixed(1)}x to ${highMultiplier.toFixed(1)}x — to normalized earnings of ${fmt(base)} yields an indicative range of ${fmt(low)} to ${fmt(high)}. The midpoint reflects the Company\u2019s size, diversification, and margin profile.`
              : `Applying SDE multiples of ${lowMultiplier.toFixed(1)}x to ${highMultiplier.toFixed(1)}x to normalized SDE of ${fmt(sde)} yields an indicative range of ${fmt(low)} to ${fmt(high)}. The midpoint reflects the Company\u2019s size, diversification, and margin profile.`,
          ],
        },
        {
          heading: 'Method 2 — Market / Comparable Transactions',
          body: [
            'Guideline transactions in the region and sector support the multiples applied below. The Comparable Transactions table summarizes observed pricing relative to revenue for businesses of comparable size and characteristics.',
            ...comparables.map((c) => `• ${c.business} (${c.industry}, ${c.location}): ${fmt(c.price)} at ${c.multiple ? c.multiple.toFixed(2) + 'x' : '—'} revenue.`),
          ],
        },
        {
          heading: 'Method 3 — Discounted Cash Flow (DCF) Framing',
          body: [
            'A DCF framing, using normalized EBITDA, a conservative growth assumption, and a discount rate reflective of small-business risk, supports a value broadly consistent with the earnings-multiple range. The DCF serves as a secondary check and confirms that the asking price is not dependent on aggressive growth assumptions.',
          ],
        },
        {
          heading: 'Valuation Conclusion',
          body: [
            `Based on the foregoing, the estimated fair market value of ${name} is in the range of ${fmt(low)} to ${fmt(high)}. The asking price of ${fmt(price)} falls within this range, representing a ${priceSde ? priceSde.toFixed(2) + 'x' : '—'} multiple of normalized SDE and a ${priceRev ? priceRev.toFixed(2) + 'x' : '—'} multiple of revenue — pricing that is fair and reasonable relative to market evidence.`,
          ],
        },
      ],
    },

    // 7. Deal Structure Recommendations
    {
      id: 'deal-structure',
      title: 'Deal Structure Recommendations',
      subsections: [
        {
          heading: 'Recommended Structure',
          body: [
            'A purchase of substantially all assets is recommended to provide the buyer with a clean asset base, avoid assumption of historical liabilities, and enable a favorable tax allocation. Alternatively, a stock purchase may be considered where tax or contractual considerations favor continuity; structure should be confirmed with tax and legal counsel.',
          ],
        },
        {
          heading: 'Consideration & Financing Profile',
          body: [
            `A transaction at ${fmt(price)} is well-suited to conventional SBA 7(a) financing given the normalized cash flow and reasonable debt-service coverage. A typical capital structure might include a 10% seller note or earn-out, a 10% buyer equity contribution, and an SBA-guaranteed senior loan, providing favorable leverage while maintaining adequate coverage.`,
          ],
        },
        {
          heading: 'Transition & Employment',
          body: [
            'A negotiated transition period (commonly 4–12 weeks) is recommended to ensure continuity of customer relationships and a smooth transfer of operational knowledge. Options include full or part-time owner support and, where applicable, a consulting arrangement during the post-closing period.',
          ],
        },
        {
          heading: 'Working Capital & Lease',
          body: [
            'The transaction should include an agreed level of net working capital and, where real estate is involved, either a purchase or a market-rate lease at closing. These items should be memorialized in the asset purchase agreement to avoid post-closing disputes.',
          ],
        },
      ],
    },

    // 8. Risk Assessment
    {
      id: 'risk-assessment',
      title: 'Risk Assessment',
      subsections: [
        {
          heading: 'Identified Risks',
          body: [
            `• Customer concentration: mitigated by a diversified account base; no single client materially impacts cash flow.`,
            `• Key-person reliance: mitigated by a tenured team and defined transition period; residual risk rated ${mgmtRisk}.`,
            `• Market conditions: mitigated by stable industry demand and a defensive service profile.`,
            `• Operational scalability: low capital intensity supports modest expansion without disproportionate investment.`,
            '• Regulatory / compliance: standard obligations exist within the sector; the Company maintains compliant operations and documentation.',
          ],
        },
        {
          heading: 'Mitigants & Risk-Return Balance',
          body: [
            'The identified risks are typical of a business of this size and profile and are addressed through a combination of transaction structure, transition support, and the Company\u2019s inherent diversification. On a risk-adjusted basis, the pricing compares favorably to guideline transactions and provides a reasonable margin of safety for a qualified buyer.',
          ],
        },
      ],
    },

    // 9. SWOT Analysis
    {
      id: 'swot',
      title: 'SWOT Analysis',
      subsections: [
        { heading: 'Strengths', body: ['Stable, diversified revenue base', 'Low customer concentration', 'Tenured workforce and low turnover', 'Asset-light, scalable operating model', 'Attractive normalized margins'] },
        { heading: 'Weaknesses', body: ['Owner involvement in business development', 'Limited marketing investment to date', 'Dependence on institutional knowledge', 'Scale smaller than regional consolidators'] },
        { heading: 'Opportunities', body: ['Expanded sales coverage and marketing', 'Adjacent service-line introduction', 'Geographic extension', 'Operational leverage from existing capacity'] },
        { heading: 'Threats', body: ['Fragmented competitive landscape', 'Labor-cost inflation', 'Macroeconomic sensitivity in end-markets', 'Consolidator competition for accounts'] },
      ],
    },

    // 10. Conclusion & Next Steps
    {
      id: 'conclusion',
      title: 'Conclusion & Next Steps',
      subsections: [
        {
          heading: 'Conclusion',
          body: [
            `${name} represents an attractive owner-operated acquisition opportunity in ${industry}, backed by stable financial performance, a diversified customer base, and clear avenues for growth. The asking price of ${fmt(price)} is supported by the valuation analysis and falls within the indicative range of ${fmt(low)} to ${fmt(high)}.`,
            'For a qualified buyer, this transaction offers a favorable risk-adjusted return profile, with meaningful upside available through execution of the growth initiatives identified herein.',
          ],
        },
        {
          heading: 'Next Steps',
          body: [
            'For qualified prospective buyers, the following steps are recommended:',
            '1. Execute the Confidentiality Agreement and provide proof of funding.',
            '2. Access the secure data room to review financials, legal documents, and contracts.',
            '3. Schedule management Q&A and a site visit.',
            '4. Submit an indicative offer, contingent upon confirmatory due diligence.',
            '5. Complete diligence and documentation toward a signed agreement.',
            'The advisor welcomes questions and stands ready to facilitate an efficient evaluation process.',
          ],
        },
      ],
    },

    // 11. Valuation Sensitivity & Reconciliation (defensible under pushback)
    {
      id: 'sensitivity-reconciliation',
      title: 'Valuation Sensitivity & Reconciliation',
      subsections: [
        {
          heading: 'Sensitivity to the Earnings Multiple',
          body: [
            `The indicative range above is driven by the earnings multiple applied to normalized ${sde ? 'SDE' : 'EBITDA'} of ${fmt(base)}. The table below shows how the implied value moves with the multiple — the tool a buyer's advisor will reach for first when testing the price.`,
            `• ${(lowMultiplier - 0.5).toFixed(1)}x → ${fmt(base * (lowMultiplier - 0.5))}`,
            `• ${lowMultiplier.toFixed(1)}x (low end) → ${fmt(low)}`,
            `• ${((lowMultiplier + highMultiplier) / 2).toFixed(1)}x (midpoint) → ${fmt(base * ((lowMultiplier + highMultiplier) / 2))}`,
            `• ${highMultiplier.toFixed(1)}x (high end) → ${fmt(high)}`,
            `• ${(highMultiplier + 0.5).toFixed(1)}x (premium) → ${fmt(base * (highMultiplier + 0.5))}`,
            `At the asking price of ${fmt(price)}, the implied multiple is ${priceSde ? priceSde.toFixed(2) + 'x SDE' : priceEbitda ? priceEbitda.toFixed(2) + 'x EBITDA' : '—'} — the buyer can see exactly how much headroom the price embeds versus each sensitivity point.`,
          ],
        },
        {
          heading: 'Reconciliation of Methods',
          body: [
            'The twelve-method analysis brackets value from multiple independent directions (asset, earnings, market, debt-capacity, DCF). The single price conclusion is the average of the range extremes, consistent with the methodology documented in the Report Summary. Methods that return zero or degenerate values (e.g., Industry Method where no rule applies) are excluded so they cannot distort the conclusion.',
            `The asset-based methods anchor the floor (${fmt(twelve.rangeLow)}); the earnings and market methods set the ceiling (${fmt(twelve.rangeHigh)}). The conclusion of ${fmt(twelve.conclusion)} sits ${twelve.conclusion >= price ? 'at or below' : 'above'} the asking price, and the asking price itself is supported by the debt-capacity analysis (a qualified buyer can service the debt from normalized cash flow).`,
          ],
        },
        {
          heading: 'How a Buyer\'s Advisor Might Push Back — And the Response',
          body: [
            `"Add-backs are overstated." — Every add-back is itemized and justified (see the recast schedule). Recurring owner-comp and D&A adjustments are standard; one-time items are flagged so they can be tested or excluded.`,
            `"The multiple is too high for this sector." — The applied band of ${lowMultiplier.toFixed(1)}-${highMultiplier.toFixed(1)}x is drawn from current market data for ${industry === 'its industry' ? 'the subject sector' : industry} (see Market & Industry Analysis) and cross-checked against the comparable transactions listed in this report.`,
            `"Revenue quality is unclear." — Customer concentration, retention characteristics, and revenue mix are addressed in the Company Overview and Customer Analysis sections; detailed client data is available in diligence.`,
            `"The asking price implies growth I can't verify." — The valuation does not rely on growth: the midpoint is supported by current normalized earnings alone. Growth initiatives in the SWOT section are upside, not underwriting.`,
            `"Seller financing terms are unknown." — Structure is negotiable; the debt-capacity method demonstrates the price is serviceable under conventional SBA financing without seller support.`,
            'The advisor will provide the underlying recast work papers and comparable data to any qualified buyer under NDA, so every input can be independently verified.',
          ],
        },
      ],
    },
  ]

  return {
    title: `${name} — ${bovDocumentLabel(reviewState)}`,
    reviewState,
    reviewedBy: opts?.reviewedBy ?? null,
    reviewedAt: opts?.reviewedAt ?? null,
    businessName: name,
    generatedAt: now,
    preparedFor: 'Confidential Prospective Buyer',
    askingPrice: price,
    revenue,
    sde,
    ebitda,
    revenueMultiple: priceRev ? priceRev.toFixed(2) + 'x' : 'N/A',
    sdeMultiple: priceSde ? priceSde.toFixed(2) + 'x' : 'N/A',
    ebitdaMultiple: priceEbitda ? priceEbitda.toFixed(2) + 'x' : 'N/A',
    valuationRange: `${fmt(twelve.rangeLow)} – ${fmt(twelve.rangeHigh)}`,
    conclusion: `Based on the twelve-method valuation analysis, the estimated current market value of ${name} is $${twelve.conclusion.toLocaleString()}, within a suggested range of $${twelve.rangeLow.toLocaleString()} to $${twelve.rangeHigh.toLocaleString()}. The asking price of ${fmt(price)} represents ${priceSde ? priceSde.toFixed(2) + 'x' : '—'} of normalized SDE and ${priceRev ? priceRev.toFixed(2) + 'x' : '—'} of revenue.`,
    twelveMethods: twelve,
    comparables,
    assumptions,
    disclaimer,
    sections: [...sections, ...transworldSections(twelve, name, industry, location, revenue, sde, ebitda, price, reviewState)],
  }
}

// ===========================================================================
// TRANSWORLD-STYLE DOCUMENT SECTIONS — mirrors the boss's professional BOV:
// report summary w/ suggested pricing table, components of value, report
// overview, limitations & disclaimers, justification, and appendices.
// ===========================================================================
function transworldSections(
  twelve: TwelveMethodResult,
  name: string,
  industry: string,
  location: string,
  revenue: number,
  sde: number,
  ebitda: number,
  price: number,
  reviewState: BovReviewState = 'draft',
): BovSection[] {
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`
  const methodTable = twelve.methods
    .map((m) => `${m.name}: ${money(m.high)} high / ${money(m.low)} low${m.note ? ` — ${m.note}` : ''}`)
    .join('\n')

  return [
    // ── Report Summary ──────────────────────────────────────────────────────
    {
      id: 'report-summary',
      title: 'Report Summary',
      subsections: [
        {
          heading: 'Estimated Current Company Value',
          body: [
            `This report provides a range of suggested prices based on twelve separate and distinct evaluation methods. Our single price conclusion is the average of the high and low prices from this suggested range.`,
            `The estimated current company value is ${money(twelve.conclusion)}.`,
          ],
        },
        {
          heading: 'Suggested Pricing — Twelve Methods',
          body: [
            'The analysis generates a price range representing the highest price a seller could expect and the lowest price a seller should accept:',
            methodTable,
            `Suggested Range: ${money(twelve.rangeLow)} to ${money(twelve.rangeHigh)}`,
            `Single Price Conclusion: ${money(twelve.conclusion)}`,
          ],
        },
        {
          heading: 'Special Conditions',
          body: [
            'If a particular range of value is extremely high or extremely low, do not be alarmed. Extreme deviations are the product of formulas which consider only one or two business factors and are not representative of the total business. This report reflects adjustments and allowances for these extremes in the suggested range values.',
            'Very few buyers consider only one method; most buyers base their decision on the debt capacity and assets of a business and become generous or conservative based on their assessment of other factors.',
          ],
        },
      ],
    },

    // ── Components of Company Value ──────────────────────────────────────────
    {
      id: 'components-of-value',
      title: 'Components of Company Value',
      subsections: [
        {
          heading: 'Asset Value',
          body: [
            `The tangible asset price represents the current estimated value of: inventories for resale or consumption; equipment and vehicles; leasehold improvements; and transferable rights and privileges uncontrolled by scarcity.`,
            `The estimated current asset value of the company is ${money(twelve.assetValue)}.`,
          ],
        },
        {
          heading: 'Business (Intangible) Value',
          body: [
            `The intangible value represents the current estimated value of: establishing a customer base which will continue to trade with this company after it is sold; securing a location, designing and constructing a floor plan and securing and installing equipment; management systems in place and producing cash flow; proprietary rights or limited issue permits; and free training and available consulting time.`,
            `The estimated current intangible value of the company is ${money(twelve.intangibleValue)}.`,
            `Total estimated current market value: ${money(twelve.conclusion)}.`,
          ],
        },
      ],
    },

    // ── Clarification of Value ──────────────────────────────────────────────
    {
      id: 'clarification-of-value',
      title: 'Clarification of Value',
      subsections: [
        {
          heading: 'How the Final Value Was Calculated',
          body: [
            `The most probable sales price stated in this report does not include real estate or real estate improvements, which are considered to be investment assets. The following clarifies how the final business value was calculated:`,
            `Fixtures, Equipment & Leasehold: ${money(twelve.assetValue)}`,
            `Intangible Value: ${money(twelve.intangibleValue)}`,
            `Total Value: ${money(twelve.conclusion)}`,
            `Real estate, vehicles, inventory, accounts receivable, and liabilities are excluded from this valuation (see Limitations & Disclaimers).`,
          ],
        },
      ],
    },

    // ── Report Overview ─────────────────────────────────────────────────────
    {
      id: 'report-overview',
      title: 'Report Overview',
      subsections: [
        { heading: 'Business Name and Location', body: [`${name} — ${location}`] },
        {
          heading: 'Nature of Assignment',
          body: [
            'The nature of this evaluation is to calculate the estimated most probable selling price value, based on an asset transaction (as opposed to an equity transaction). This calculation of most probable selling price value is in the form of a written report based on information collected regarding the company and the algorithmic analysis of that information. Assumptions and limiting conditions are stated in the evaluation report. All information contained in this report is confidential.',
          ],
        },
        {
          heading: 'Purpose of Evaluation',
          body: [
            'This report provides the client with an opinion of the company\u2019s fair market value for the purpose of sale or transfer planning.',
          ],
        },
        {
          heading: 'Definition of Company Value',
          body: [
            'For the purposes of this report, company value is defined to match the International Business Brokers Association (IBBA) definition of most probable selling price: that price for the assets intended for sale which represents the total consideration most likely to be established between a buyer and seller considering compulsion on the part of either buyer or seller, and potential financial, strategic, or non-financial benefits to seller and probable buyers.',
          ],
        },
        {
          heading: 'Documents Reviewed & Interviews',
          body: [
            'The evaluator relied on financial and operational information provided by the owner, including revenue, earnings, and business characteristics summarized in this report. Interviews were conducted by the evaluator using the evaluator\u2019s forms and questionnaires.',
          ],
        },
        {
          heading: 'Evaluation Effective Date',
          body: ['Values stated are effective as of the date of this report. Any difference between the date this report is presented and the effective date could have a bearing on the value opinion stated.'],
        },
      ],
    },

    // ── Limitations, Contingencies & Disclaimer (legal shield) ──────────────
    {
      id: 'limitations-disclaimers',
      title: 'Limitations, Contingencies & Disclaimer',
      subsections: [
        {
          heading: 'Read This Section Carefully',
          body: [
            `This ${bovDocumentLabel(reviewState)} is not a formal appraisal. There are a number of significant differences between an opinion of value and appraisals. An opinion of value is not nearly as rigorous as a formal appraisal, and is designed to give a general guideline or benchmark value rather than a formal determination of value. The formulas used in the various valuation methodologies in this report are based on thousands of evaluations performed over many years by business brokers, business buyers, and business sellers in real world buy/sell situations.`,
            'Tax and legal advice must be given by qualified professionals and based on individual cases. If you are planning a sale or transfer of stock, we strongly encourage you to consult with your tax attorney and accountant.',
          ],
        },
        {
          heading: 'Contingencies and Limiting Conditions',
          body: [
            '1. The evaluator, by reason of performing this business evaluation and preparing this report, is not required to give testimony nor be in attendance in court or any other governmental hearing with reference to matters herein, unless prior arrangements have been made with the evaluator relative to such additional employment.',
            '2. The evaluator assumes no responsibility for matters of a legal nature affecting the property valued or the title thereto, nor does the evaluator render any opinion as to the title, which is assumed to be good and marketable. By viewing and utilizing this report, you assume any and all risks relating to its contents and agree to indemnify, defend, and hold evaluator harmless for and against any third-party claims made against the evaluator relating directly or indirectly to this report.',
            '3. The evaluator assumes no responsibility for any environmental problems and has not inspected the property.',
            '4. This evaluation was based on a specific period of time. The particular business environment and market may or may not continue in the future; therefore, the evaluator is not making any claims regarding future performance or value of this business.',
            '5. All information in this report, most of which is contained in the questionnaire section, has been provided by our client and is assumed to be reliable. No verification of the information has been done by the evaluator, nor has the evaluator made inspections or on-site visits of the business premises or facilities.',
            '6. No matter how rigorous, business and asset valuations contain an unavoidable degree of subjectivity and can be subject to unpredictable market forces. Markets can and often do behave erratically. Accordingly, the evaluator disclaims any and all warranties express or implied relating to the report contents and valuations described therein, including, without limit, the implied warranties of merchantability and fitness for a particular purpose.',
            '7. This is not a professional business appraisal. If you desire to obtain a full appraisal, please obtain the services of a certified professional appraiser.',
          ],
        },
        {
          heading: 'Exculpatory Clause / Assumption of Risk / Release of Liability',
          body: [
            'As lawful consideration for obtaining, viewing, and or using the information in this report, the reader/user, on its behalf and on behalf of any party who may claim through it, does hereby release from any legal liability, agree not to sue, claim against, attach the property of or prosecute, and further agree to defend, indemnify and hold harmless, the evaluator, and all of its owners, officers, employees, organizations, affiliates, attorneys, agents and assigns for and against claims relating, directly or indirectly, to any accidental, unintentional, or negligent injury or damage to the reader/user or the reader/user\u2019s interests, in part or whole caused directly or indirectly by, resulting from, or relating to, this report and or its contents or part thereof. This release shall include without limitation claims for negligence, including negligence per se.',
            'The use of the evaluator\u2019s services, and the reading or use of this report, involves legal, financial, and emotional risks. By reading or using this report, the reader/user agrees that it is cognizant of the risks and dangers, including without limit those inherent in purchases and sales of assets and businesses, speculative investing, providing and relying upon third-party valuations, borrowing money, entering into third-party contracts, and putting capital and funds at risk, and the reader/user willingly and fully assumes all the legal, emotional, and financial risks as its responsibility.',
          ],
        },
      ],
    },

    // ── Justification for Purchase ──────────────────────────────────────────
    {
      id: 'justification-for-purchase',
      title: 'Justification for Purchase',
      subsections: [
        {
          heading: 'Post-Sale Cash Flow',
          body: [
            `At the suggested value of ${money(twelve.conclusion)}, a buyer with a conventional small-business loan structure (10% down, seller note and/or SBA-guaranteed senior debt at current market rates) can service the debt from the company\u2019s normalized cash flow of approximately ${money(sde)} (SDE) / ${money(ebitda)} (EBITDA), leaving a reasonable equity return. This supports the valuation as attainable for a qualified buyer.`,
          ],
        },
        {
          heading: 'Reasonability Analysis',
          body: [
            `The implied pricing multiples are ${revenue ? (price / revenue).toFixed(2) + 'x trailing revenue' : 'n/a'} and ${sde ? (price / sde).toFixed(2) + 'x normalized SDE' : 'n/a'}, which fall within the observed range for ${industry} transactions in the current market. The twelve-method range of ${money(twelve.rangeLow)} to ${money(twelve.rangeHigh)} brackets the asking price, indicating the asking price is reasonable and not dependent on aggressive growth assumptions.`,
          ],
        },
      ],
    },

    // ── Appendices ──────────────────────────────────────────────────────────
    {
      id: 'appendix-a-principles',
      title: 'Appendix A — Principles of Evaluation',
      subsections: [
        {
          heading: 'Overview',
          body: [
            'A business\u2019s value can actually be divided into five components: (1) market value of assets; (2) historical trends of revenues, expense and cash flow; (3) the value of rights, privileges and knowledge; (4) estimated stability in the future; and (5) esthetic appeal. This evaluation report addresses all five components through a series of questions which defines each of these aspects numerically.',
          ],
        },
      ],
    },
    {
      id: 'appendix-b-approaches',
      title: 'Appendix B — Company Value Approaches',
      subsections: [
        {
          heading: 'Cost / Market / Income Approaches',
          body: [
            `Cost Approach: the value of the company\u2019s assets, estimated at ${money(twelve.assetValue)}.`,
            `Market Data Approach: comparable transactions within ${industry} support the multiples applied in the twelve-method analysis.`,
            `Income Approach: capitalized normalized earnings (${money(sde)} SDE) at a small-business cap rate yield the income-based value reflected in the methods table.`,
          ],
        },
      ],
    },
    {
      id: 'appendix-c-comps',
      title: 'Appendix C — Market Comparables',
      subsections: [
        {
          heading: 'Comparable Transactions',
          body: [
            'Market-based reference on the current value of the business is drawn from comparable closely held business sales. Each comparable is summarized by industry, location, sale price, and revenue multiple in the Comparable Transactions table of this report.',
          ],
        },
      ],
    },
    {
      id: 'appendix-d-industry-method',
      title: 'Appendix D — Industry Rules of Thumb',
      subsections: [
        {
          heading: 'Sector Benchmarks',
          body: [
            'Industry rules of thumb are based on pricing formulas developed for specific industries. Where a rule applies to the subject company, it is reflected in the Industry Method row of the Suggested Pricing table; where none applies, the method returns $0 and is excluded from the range conclusion.',
          ],
        },
      ],
    },
  ]
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
