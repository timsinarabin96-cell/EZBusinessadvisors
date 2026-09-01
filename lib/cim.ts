/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { supabase } from '@/lib/supabase/client'
import type { Listing } from '@/lib/listings'
import { bandForIndustry, matchIndustry, type MarketBand } from '@/lib/marketMultiplesCore.ts'
import type { RecastResult } from '@/lib/recast.ts'
import { resolveNormalizedEarnings, latestYoYRevenue, latestSdeMargin } from '@/lib/normalizedEarnings.ts'

// ---------------------------------------------------------------------------
// CIM (Confidential Information Memorandum) generator — 25+ section,
// investment-bank quality. Uses cim_versions table (sql/full_schema.sql).
// ---------------------------------------------------------------------------

export interface CimSection {
  id: string
  title: string
  subsections: { heading: string; body: string[] }[]
}

export interface CimContent {
  title: string
  subtitle: string
  generatedAt: string
  confidential: boolean
  sections: CimSection[]
}

export interface CimVersion {
  id: string
  listing_id: string | null
  version: number
  title: string | null
  content_json: CimContent | null
  status: string
  created_at?: string | null
  updated_at?: string | null
}

const fmt = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '$—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
const pct = (n: number | null | undefined): string =>
  n === null || n === undefined || isNaN(n) ? '—' : (n * 100).toFixed(1) + '%'

// ---------------------------------------------------------------------------
// Generate a print-ready, 30+ page CIM from listing data (Phase: send path
// quality bar). Accepts an optional recast result so the financial sections
// carry real multi-year tables + itemized add-back justifications instead of
// boilerplate — the document a buyer's advisor will actually read.
// ---------------------------------------------------------------------------
export interface CimInput {
  listing: Listing
  recast?: RecastResult | null
  marketBand?: MarketBand | null
}

export function generateCimContent(listing: Listing, opts?: { recast?: RecastResult | null; marketBand?: MarketBand | null }): CimContent {
  const recast = opts?.recast || null
  const marketBand = opts?.marketBand || bandForIndustry(listing.industry, listing.ebitda ? 'EBITDA' : 'SDE') || null
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const price = listing.asking_price
  // SINGLE SOURCE OF TRUTH (audit fix 08-31): normalized earnings always come
  // from the recast when one exists — never from the raw listing fields, which
  // were a second, divergent calculation (cover $318k vs recast $572k).
  const earnings = resolveNormalizedEarnings(listing, recast)
  const revenue = earnings.revenue
  const sde = earnings.sde
  const ebitda = earnings.ebitda
  const priceRev = revenue && price ? price / revenue : null
  const priceEbitda = ebitda && price ? price / ebitda : null
  const sdeMultiple = sde && price ? price / sde : null
  const grossMargin = revenue ? (revenue - (listing.inventory_value || 0)) / revenue : null
  const industry = listing.industry || 'business services'
  const yoyRevenue = latestYoYRevenue(earnings)

  // Multi-year financial rows from the canonical earnings (recast years when
  // present, else the single derived year) — real tables, one source.
  const multiYearRows = earnings.years.map((yr) => ({
    label: yr.label,
    revenue: yr.revenue,
    sde: yr.sde,
    ebitda: yr.ebitda,
    addBacks: yr.totalAddBacks,
  }))
  const analysis = recast?.analysis || null
  const bandLine = marketBand
    ? `${marketBand.industry} businesses typically transact at ${marketBand.min.toFixed(1)}-${marketBand.max.toFixed(1)}x ${marketBand.basis} in the current market (${marketBand.sourceNote || 'market data'}).`
    : null

  const sections: CimSection[] = [
    // ---- Cover data / front matter ----
    { id: 'disclaimer', title: 'Important Notice & Confidentiality', subsections: [{ heading: 'Confidentiality', body: [
      `This Confidential Information Memorandum ("CIM") has been prepared for the sole purpose of providing prospective buyers with information about the sale of ${listing.business_name || 'the business'}. It is being provided subject to the terms of a Non-Disclosure Agreement.`,
      'This document does not constitute an offer or solicitation. All figures are derived from owner-provided financial information and have not been independently audited. Prospective buyers should conduct their own due diligence.',
    ] }] },
    { id: 'table-of-contents', title: 'Table of Contents', subsections: [{ heading: 'Sections', body: [
      '1. Executive Summary', '2. The Offering', '3. Business Overview', '4. Products & Services', '5. Customer Analysis',
      '6. Financial Summary', '7. Historical Financial Performance', '8. Recast / Normalized Earnings', '8A. Multi-Year Trend Analysis', '8B. Add-Back Justification',
      '9. Valuation Metrics', '9A. Market Comparables', '10. Industry Analysis', '11. Market Position & Competitive Landscape', '12. Growth Opportunities',
      '13. Sales & Marketing', '14. Operations & Facilities', '15. Equipment & Assets', '16. Real Estate', '17. Employees & Management', '18. Key Person Risk & Transition',
      '19. Legal & Regulatory', '20. Franchise / Licensing (if applicable)', '21. Technology & Systems', '22. Risk Factors', '23. Investment Highlights',
      '24. Reasons for Sale', '25. Transaction Summary & Process', '26. Confidential Buyer Questionnaire',
    ] }] },

    // ---- Business ----
    { id: 'executive-summary', title: '1. Executive Summary', subsections: [
      { heading: 'Overview', body: [
        listing.description || `${listing.business_name} is being offered for sale. This CIM provides an overview of the business, operations, financial performance, and growth opportunities for prospective buyers.`,
        `The Company generates annual revenue of ${fmt(revenue)} with normalized Seller's Discretionary Earnings (SDE) of ${fmt(sde)}${ebitda ? ` and EBITDA of ${fmt(ebitda)}` : ''} as presented in Section 8.`,
      ] },
      { heading: 'Business at a Glance', body: [
        `Asking Price: ${fmt(price)}`,
        `Gross Revenue: ${fmt(revenue)}`,
        `SDE: ${fmt(sde)}`,
        ...(ebitda ? [`EBITDA: ${fmt(ebitda)}`] : []),
        `Industry: ${industry}`,
        `Location: ${listing.location_general || 'N/A'}`,
        `Real Estate Included: ${listing.real_estate_included ? 'Yes' : 'No'}`,
        `Inventory: ${fmt(listing.inventory_value)}`,
        `FF&E: ${fmt(listing.ffe_value)}`,
      ] },
    ] },
    { id: 'offering', title: '2. The Offering', subsections: [
      { heading: 'The Opportunity', body: [
        `${listing.business_name} presents a compelling acquisition opportunity in the ${industry} sector${listing.location_general ? `, located in ${listing.location_general}` : ''}.`,
        'The transaction is offered on a sale-of-assets basis with a full transition period to ensure continuity of operations and client relationships.',
      ] },
      { heading: 'Terms', body: [
        `The current asking price is ${fmt(price)}. The structure is negotiable and may be tailored to the buyer's financing profile.`,
        ...(listing.seller_financing_available
          ? [`Seller financing is available for qualified purchasers${listing.financing_notes ? `: ${listing.financing_notes}` : '.'}`]
          : ['Seller financing terms, if any, will be discussed directly with qualified buyers.']),
        ...(typeof (listing as any).asset_sale === 'boolean'
          ? [(listing as any).asset_sale ? 'An asset purchase structure is anticipated.' : 'The transaction structure will be confirmed during due diligence.']
          : ['An asset purchase structure is anticipated with no historical liabilities assumed.']),
      ] },
    ] },
    { id: 'business-overview', title: '3. Business Overview', subsections: [
      { heading: 'History & Background', body: [
        `${listing.business_name || 'The Company'} operates in the ${industry} sector${listing.location_general ? `, serving the ${listing.location_general} market` : ''}${listing.established_year ? ` since ${listing.established_year}` : ''}.`,
        listing.description || `${listing.business_name || 'The Company'} delivers services through an established operating model with documented processes and transferable vendor relationships.`,
        ...(listing.sub_industry ? [`Primary niche: ${listing.sub_industry}.`] : []),
      ] },
      { heading: 'Business Model', body: [
        listing.description
          ? `Revenue is generated through the business model described above: ${listing.description}`
          : 'Revenue is generated through the company\'s core operating activities, with a mix of recurring and transactional streams.',
        ...(listing.employees_full_time || listing.employees_part_time
          ? [`The operation is staffed by ${[listing.employees_full_time ? `${listing.employees_full_time} full-time` : null, listing.employees_part_time ? `${listing.employees_part_time} part-time` : null].filter(Boolean).join(' and ')} employees.`]
          : []),
        ...(listing.owner_hours_weekly ? [`The current owner dedicates approximately ${listing.owner_hours_weekly} hours per week to the business.`] : []),
      ] },
    ] },
    { id: 'products-services', title: '4. Products & Services', subsections: [
      { heading: 'Core Offerings', body: [
        listing.description
          ? `The business delivers: ${listing.description}`
          : `The business provides a defined set of core services within the ${industry} sector, delivered with consistent quality and service standards.`,
        ...(listing.competitive_advantages ? [`Service differentiation is anchored on: ${listing.competitive_advantages}`] : []),
      ] },
      { heading: 'Pricing', body: [
        listing.description && /\$|price|fee|rate/i.test(listing.description)
          ? `Pricing structure is described in the overview: ${listing.description}`
          : 'Pricing reflects the seller\'s current positioning; details are available to qualified buyers.',
        'Pricing strategy under new ownership may be reviewed by the buyer.',
      ] },
    ] },
    { id: 'customer-analysis', title: '5. Customer Analysis', subsections: [
      { heading: 'Customer Base', body: [
        listing.customer_concentration
          ? `Customer composition: ${listing.customer_concentration}`
          : 'The customer base is diversified, reducing reliance on any single client and providing stable, recurring revenue.',
        'Client relationships are characterized by high retention, driven by service quality and account management.',
      ] },
      { heading: 'Concentration Risk', body: [
        listing.customer_concentration
          ? `Concentration profile: ${listing.customer_concentration}`
          : 'Customer concentration is monitored; the largest clients contribute meaningfully but do not represent undue risk to the enterprise.',
        'A detailed client list and concentration analysis is available to qualified buyers under NDA.',
      ] },
    ] },

    // ---- Financial ----
    { id: 'financial-summary', title: '6. Financial Summary', subsections: [
      { heading: 'Highlights', body: [
        `Annual Revenue: ${fmt(revenue)}`,
        `SDE: ${fmt(sde)}`,
        ...(ebitda ? [`EBITDA: ${fmt(ebitda)}`] : []),
        `Gross Margin: ${pct(grossMargin)}`,
        ...(bandLine ? [`Market Benchmark: ${bandLine}`] : []),
      ] },
      { heading: 'Key Ratios', body: [
        `SDE Margin: ${sde && revenue ? pct(sde / revenue) : '—'}`,
        `SDE Multiple (asking): ${sdeMultiple ? sdeMultiple.toFixed(2) + 'x' : '—'}`,
        `Price / Revenue: ${priceRev ? priceRev.toFixed(2) + 'x' : '—'}`,
        ...(multiYearRows.length >= 2
          ? [`Revenue Trajectory: ${fmt(multiYearRows[0].revenue)} → ${fmt(multiYearRows[multiYearRows.length - 1].revenue)} across ${multiYearRows.length} periods.`]
          : []),
      ] },
    ] },
    { id: 'historical-financials', title: '7. Historical Financial Performance', subsections: [
      { heading: 'Performance Overview', body: [
        `The business has delivered annual revenue of approximately ${fmt(revenue)} with normalized earnings of ${fmt(sde)}.`,
        'Owner-provided figures have been normalized to reflect true economic earnings (see Section 8).',
        ...(analysis?.trendNote ? [analysis.trendNote] : []),
      ] },
      ...(multiYearRows.length >= 2
        ? [{ heading: 'Multi-Year Summary', body: [
            ...multiYearRows.map((yr) => `${yr.label}: Revenue ${fmt(yr.revenue)} · Recast SDE ${fmt(yr.sde)} · Recast EBITDA ${fmt(yr.ebitda)}`),
            'Figures reflect normalized earnings after the add-backs itemized in Section 8B. Detailed P&L statements, tax returns, and balance-sheet information are available to qualified buyers under NDA.',
          ] }]
        : []),
    ] },
    { id: 'recast-earnings', title: '8. Recast / Normalized Earnings', subsections: [
      { heading: 'Normalization Adjustments', body: [
        'The SDE and EBITDA figures shown throughout this document reflect normalized earnings after standard broker add-backs. Each adjustment is itemized and justified in Section 8B so that a buyer, lender, or independent accountant can verify every line during due diligence.',
      ] },
      { heading: 'Typical Add-Backs', body: [
        '• Owner compensation above market rate — added back',
        '• Owner health benefits, retirement, and auto — added back',
        '• Depreciation and amortization — added back',
        '• Interest expense (non-operating) — added back',
        '• One-time, non-recurring, and discretionary expenses — added back',
        '• Non-arm\'s-length payments (family, related parties) — added back',
        '• Personal expenses (travel, meals, charitable) — added back',
      ] },
      ...(analysis?.addBackMix
        ? [{ heading: 'Quality of Earnings', body: [
            analysis.qualityNote,
            `Add-back mix (latest period): ${analysis.addBackMix.recurringPct}% recurring / ${100 - analysis.addBackMix.recurringPct}% one-time & discretionary.`,
          ] }]
        : []),
      { heading: 'Note', body: [
        'A complete, itemized recast is available to qualified buyers under NDA. Figures should be verified by the buyer\'s accountant or lender.',
      ] },
    ] },
    ...(multiYearRows.length >= 2 && analysis
      ? [{
          id: 'multi-year-trend',
          title: '8A. Multi-Year Trend Analysis',
          subsections: [
            { heading: 'Revenue & Earnings Trend', body: [
              analysis.trendNote,
              `Compound annual growth: Revenue ${analysis.cagr.revenue !== null ? (analysis.cagr.revenue * 100).toFixed(1) + '%' : '—'} · SDE ${analysis.cagr.sde !== null ? (analysis.cagr.sde * 100).toFixed(1) + '%' : '—'}.`,
            ] },
            { heading: 'Margin Profile', body: [
              ...multiYearRows.map((yr, i) => {
                const sm = analysis.margins.sdeMargin[i]
                const em = analysis.margins.ebitdaMargin[i]
                return `${yr.label}: SDE margin ${sm !== null && sm !== undefined ? (sm * 100).toFixed(1) + '%' : '—'} · EBITDA margin ${em !== null && em !== undefined ? (em * 100).toFixed(1) + '%' : '—'}`
              }),
            ] },
            { heading: 'Year-over-Year Growth', body: [
              ...multiYearRows.map((yr, i) => {
                const g = analysis.yoy.revenue[i]
                return `${yr.label}: revenue ${g === null || g === undefined ? '—' : (g * 100).toFixed(1) + '%'} YoY · SDE ${analysis.yoy.sde[i] === null || analysis.yoy.sde[i] === undefined ? '—' : (analysis.yoy.sde[i]! * 100).toFixed(1) + '%'} YoY`
              }),
            ] },
          ],
        }]
      : []),
    ...(analysis?.justifications?.length
      ? [{
          id: 'add-back-justification',
          title: '8B. Add-Back Justification',
          subsections: [
            { heading: 'Why Each Adjustment Is Made', body: [
              'Each add-back category is listed with its justification. These are standard, defensible normalization adjustments under IBBA-aligned sell-side practice; every line is traceable to source records.',
            ] },
            ...analysis.justifications.map((j) => ({ heading: j.label, body: [j.justification] })),
          ],
        }]
      : []),
    { id: 'valuation-metrics', title: '9. Valuation Metrics', subsections: [
      { heading: 'Multiple Analysis', body: [
        `Asking Price: ${fmt(price)}`,
        `Price / Revenue: ${priceRev ? priceRev.toFixed(2) + 'x' : 'N/A'}`,
        `SDE Multiple: ${sdeMultiple ? sdeMultiple.toFixed(2) + 'x' : 'N/A'}`,
        ...(priceEbitda ? [`Price / EBITDA: ${priceEbitda.toFixed(2)}x`] : []),
        ...(bandLine
          ? [`Market context: ${bandLine} The asking-price multiple falls ${sdeMultiple && marketBand && sdeMultiple >= marketBand.min && sdeMultiple <= marketBand.max ? 'within' : 'outside/at the edge of'} that band and should be read together with Sections 9A and 11.`]
          : []),
      ] },
    ] },
    ...(bandLine
      ? [{
          id: 'market-comparables',
          title: '9A. Market Comparables',
          subsections: [
            { heading: 'Sector Transaction Benchmarks', body: [
              bandLine,
              `Applying the band to normalized earnings of ${fmt(sde || ebitda || 0)} yields an indicative range of ${fmt((sde || ebitda || 0) * marketBand!.min)} to ${fmt((sde || ebitda || 0) * marketBand!.max)} on a ${marketBand!.basis} basis.`,
              'Comparables are directional market evidence, not an appraisal. Final value is set by negotiation and confirmed through buyer diligence, financing capacity, and competitive bidding dynamics.',
            ] },
          ],
        }]
      : []),

    // ---- Market ----
    { id: 'industry-analysis', title: '10. Industry Analysis', subsections: [
      { heading: 'Market Overview', body: [
        `The ${industry} industry continues to demonstrate resilience with steady demand${listing.location_general ? ` in the ${listing.location_general} market` : ''}. Businesses in this sector benefit from recurring revenue, established client relationships, and moderate capital requirements.`,
        marketBand
          ? `Current market data indicates that ${marketBand.industry} businesses typically transact at ${marketBand.min.toFixed(1)}-${marketBand.max.toFixed(1)}x ${marketBand.basis} (${marketBand.sourceNote || 'market data'}), providing a benchmark for the valuation metrics presented in Section 9.`
          : 'Industry trends favor consolidation, creating opportunity for strategic and financial buyers to achieve scale and efficiency.',
      ] },
      { heading: 'Key Drivers', body: [
        'Demand is supported by durable end-market fundamentals and recurring consumption patterns.',
        'Technology adoption, operational efficiency, and service differentiation are the primary competitive levers.',
      ] },
    ] },
    { id: 'competitive-landscape', title: '11. Market Position & Competitive Landscape', subsections: [
      { heading: 'Positioning', body: [
        listing.competitive_advantages
          ? `The business differentiates itself through: ${listing.competitive_advantages}`
          : 'The market is fragmented, with a mix of owner-operated and regional players. The subject business has established a defensible position through its client base and reputation.',
        'This fragmentation presents an opportunity to differentiate through service quality, technology adoption, and targeted marketing.',
      ] },
      { heading: 'Comparable Transactions', body: [
        marketBand
          ? `Transactions in this sector typically transact at ${marketBand.min.toFixed(1)}-${marketBand.max.toFixed(1)}x ${marketBand.basis} (${marketBand.industry} market data).`
          : 'Transactions in this sector typically transact at multiples with a strong correlation to profitability and growth.',
        'Comparables and market data are available to qualified buyers as part of the due diligence package.',
      ] },
    ] },
    { id: 'growth-opportunities', title: '12. Growth Opportunities', subsections: [
      { heading: 'Strategic Growth Levers', body: [
        listing.growth_opportunities
          ? listing.growth_opportunities
          : '1. Expand client acquisition through digital marketing and referral programs.\n2. Introduce tiered service offerings and recurring-retainer models to increase revenue per client.\n3. Add complementary services to broaden the addressable market.\n4. Leverage technology to improve operational efficiency and margins.\n5. Geographic expansion into adjacent markets under new ownership.',
      ] },
      { heading: 'Upside Potential', body: [
        'These growth initiatives are largely incremental to current operations and require modest capital investment, offering attractive returns on investment.',
      ] },
    ] },
    { id: 'sales-marketing', title: '13. Sales & Marketing', subsections: [
      { heading: 'Current Approach', body: [
        listing.growth_opportunities && /marketing|referral|digital|lead/i.test(listing.growth_opportunities)
          ? `Current and planned customer acquisition activity: ${listing.growth_opportunities}`
          : 'The business acquires customers through a combination of direct relationships, referrals, and local/industry marketing.',
        'A portion of revenue is recurring, providing a stable base on which new marketing can layer growth.',
      ] },
      { heading: 'Opportunity', body: [
        'There is meaningful upside from formalizing the marketing function, increasing digital presence, and implementing lead-generation systems.',
      ] },
    ] },

    // ---- Operations / Assets ----
    { id: 'operations-facilities', title: '14. Operations & Facilities', subsections: [
      { heading: 'Operations', body: [
        listing.description && /operat|process|team|deliver|service/i.test(listing.description)
          ? `Operating model: ${listing.description}`
          : 'The business operates with established processes, vendor relationships, and operational controls that support consistent delivery.',
        'Day-to-day operations are well-documented and transferable to a new owner.',
      ] },
      { heading: 'Facilities', body: [
        listing.facilities_summary
          ? `Facilities: ${listing.facilities_summary}`
          : `Facilities support current operations${listing.location_general ? ` at ${listing.location_general}` : ''}.`,
        ...(listing.lease_monthly ? [`Monthly lease cost: ${fmt(listing.lease_monthly)}${listing.lease_expires_on ? `, expiring ${new Date(listing.lease_expires_on).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : ''}.`] : []),
        'Lease terms and facility details are available to qualified buyers.',
      ] },
    ] },
    { id: 'equipment-assets', title: '15. Equipment & Assets', subsections: [
      { heading: 'FF&E and Equipment', body: [
        `Furniture, fixtures, and equipment are valued at approximately ${fmt(listing.ffe_value)} and are included in the sale.`,
        'A detailed asset schedule is available to qualified buyers under NDA.',
      ] },
      { heading: 'Inventory', body: [
        `Inventory is valued at approximately ${fmt(listing.inventory_value)} and included in the purchase at market value.`,
      ] },
    ] },
    { id: 'real-estate', title: '16. Real Estate', subsections: [
      { heading: 'Ownership', body: [
        listing.real_estate_included
          ? 'Real estate is included in the sale, offering the buyer ownership of the underlying property in addition to the operating business.'
          : 'Real estate is not included in the sale. The business operates under a lease, with terms available to qualified buyers.',
        ...(listing.lease_monthly ? [`Current lease: ${fmt(listing.lease_monthly)}/month${listing.lease_expires_on ? ` through ${new Date(listing.lease_expires_on).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : ''}.`] : []),
      ] },
      { heading: 'Implication', body: [
        'Potential buyers should evaluate financing structure and real estate strategy as part of their acquisition plan.',
      ] },
    ] },

    // ---- Human capital ----
    { id: 'employees', title: '17. Employees & Management', subsections: [
      { heading: 'Workforce', body: [
        ...(listing.employees_full_time || listing.employees_part_time
          ? [`The business employs ${[listing.employees_full_time ? `${listing.employees_full_time} full-time` : null, listing.employees_part_time ? `${listing.employees_part_time} part-time` : null].filter(Boolean).join(' and ')} team members supporting day-to-day operations and service delivery.`]
          : ['The business employs a team that supports day-to-day operations and service delivery.']),
        ...(listing.owner_hours_weekly ? [`Owner involvement: approximately ${listing.owner_hours_weekly} hours per week.`] : []),
        'A detailed staffing summary, including roles, tenure, and compensation, is available to qualified buyers under NDA.',
      ] },
      { heading: 'Organizational Dependence', body: [
        'Operations are supported by the current owner. Compensation and management transition are addressed in Section 18.',
      ] },
    ] },
    { id: 'key-person-transition', title: '18. Key Person Risk & Transition', subsections: [
      { heading: 'Owner Dependence', body: [
        listing.transition_support
          ? `Transition plan: ${listing.transition_support}`
          : 'The current owner has established efficient operating processes. A defined transition period is available to transfer institutional knowledge, client relationships, and vendor relationships.',
        ...(listing.training_period_weeks ? [`The owner will remain available for approximately ${listing.training_period_weeks} weeks of training and transition support.`] : []),
      ] },
      { heading: 'Post-Sale Support', body: [
        'A transition assistance period is included to support the buyer, covering introductions to clients, vendor relationships, and operational handover.',
        listing.seller_financing_available
          ? `Seller financing is available${listing.financing_notes ? `: ${listing.financing_notes}` : ' for a qualified buyer.'}`
          : 'The owner is prepared to remain available for consultation to ensure a seamless transition.',
      ] },
    ] },

    // ---- Legal / Risk ----
    { id: 'legal-regulatory', title: '19. Legal & Regulatory', subsections: [
      { heading: 'Compliance', body: [
        ...(listing.compliance_status === 'verified'
          ? [`The business has completed platform verification for its ${industry} operations${listing.location_general ? ` in ${listing.location_general}` : ''}.`]
          : [`The business operates in the ${industry} sector${listing.location_general ? ` in ${listing.location_general}` : ''}. The seller should confirm which licenses and permits apply to its operations; license/permits status is available to qualified buyers during diligence.`]),
        ...(listing.sub_industry ? [`Regulatory context: ${listing.sub_industry} operations carry specific compliance obligations; current status is available to qualified buyers.`] : []),
        'Details of any regulatory exposure and compliance status are available to qualified buyers.',
      ] },
      { heading: 'Contracts', body: [
        'Material contracts (supplier, customer, employment) are transferable and available for review during due diligence.',
      ] },
    ] },
    { id: 'franchise-licensing', title: '20. Franchise & Licensing (if applicable)', subsections: [
      { heading: 'Status', body: [
        listing.sub_industry && /franchise|license/i.test(listing.sub_industry)
          ? `The business may operate under a franchise or license structure (${listing.sub_industry}); transfer terms should be confirmed with the seller and documented for buyer review.`
          : 'No franchise or third-party licensing structure has been indicated for this business; this should be confirmed during due diligence.',
        'Any applicable transferable licenses are documented for buyer review.',
      ] },
    ] },
    { id: 'technology-systems', title: '21. Technology & Systems', subsections: [
      { heading: 'Systems Stack', body: [
        listing.competitive_advantages && /tech|system|software|platform/i.test(listing.competitive_advantages)
          ? `Technology is a stated differentiator: ${listing.competitive_advantages}`
          : 'The business utilizes standard, transferable technology tools for operations, accounting, and customer management.',
        'Systems are documented and can be fully transitioned to the buyer, minimizing operational disruption.',
      ] },
      { heading: 'Data & IP', body: [
        'Customer data, operational documentation, and intellectual property transfer with the sale, subject to NDAs and industry regulations.',
      ] },
    ] },
    { id: 'risk-factors', title: '22. Risk Factors', subsections: [
      { heading: 'Considerations for Buyers', body: [
        listing.customer_concentration
          ? `• Customer concentration: ${listing.customer_concentration}`
          : '• Customer concentration: monitored; detailed analysis provided under NDA.',
        listing.owner_hours_weekly
          ? `• Owner involvement: the current owner dedicates ~${listing.owner_hours_weekly} hrs/week — addressed via the transition plan${listing.training_period_weeks ? ` (${listing.training_period_weeks} weeks training)` : ''}.`
          : '• Owner transition: dependence on current ownership addressed via transition period.',
        '• Market conditions: subject to industry and macroeconomic factors.',
        '• Financing: buyer must secure adequate financing to complete the transaction.',
        'These risks are typical for businesses of this type and are mitigated by the business model and transition support.',
      ] },
    ] },

    // ---- Investment case ----
    { id: 'investment-highlights', title: '23. Investment Highlights', subsections: [
      { heading: 'Key Strengths', body: [
        `Established business in the ${industry} sector with a track record of performance.`,
        `Revenue of ${fmt(revenue)} with normalized earnings of ${fmt(sde)}${ebitda ? ` and EBITDA of ${fmt(ebitda)}` : ''} (single source of truth: the recast).`,
        ...(listing.customer_concentration ? [`Customer base: ${listing.customer_concentration}`] : ['Diversified client base providing stability and recurring revenue characteristics.']),
        ...(listing.competitive_advantages ? [`Competitive strengths: ${listing.competitive_advantages}`] : []),
        'Clear growth runway requiring modest incremental investment.',
        'Favorable valuation relative to comparable transactions in the market.',
      ] },
    ] },
    { id: 'reasons-for-sale', title: '24. Reasons for Sale', subsections: [
      { heading: 'Owner Motivation', body: [
        listing.reason_for_sale
          ? `The owners are pursuing a sale for the following reasons: ${listing.reason_for_sale}.`
          : 'The owners are pursuing a sale at this time. Specific motivations are discussed with qualified buyers directly.',
        'The sale decision is a personal and business decision by the owners.',
      ] },
    ] },

    // ---- Process ----
    { id: 'transaction-summary', title: '25. Transaction Summary & Process', subsections: [
      { heading: 'Process', body: [
        '1. Sign NDA to receive full financial details.',
        '2. Submit Confidential Buyer Questionnaire (Section 26).',
        '3. Site visit / management call for qualified buyers.',
        '4. Submit Indication of Interest.',
        '5. Negotiation and execution of Letter of Intent.',
        '6. Due diligence.',
        '7. Closing.',
      ] },
      { heading: 'Timeline', body: [
        'The seller seeks a timely, efficient process. Interested parties are encouraged to move promptly to secure exclusivity.',
      ] },
    ] },
    { id: 'buyer-questionnaire', title: '26. Confidential Buyer Questionnaire', subsections: [
      { heading: 'Please Provide', body: [
        '• Corporate / personal background and experience',
        '• Acquisition objectives and intended use',
        '• Financial capacity and proof of funds',
        '• Proposed structure or financing plan',
        '• Timing and ability to close',
        '• References (bank, professional)',
      ] },
    ] },
  ]

  return {
    title: listing.business_name || 'Confidential Business',
    subtitle: listing.headline || 'Confidential Information Memorandum',
    generatedAt: now,
    confidential: true,
    sections,
  }
}

// ---------------------------------------------------------------------------
// Shareable link — creates a public share key stored on the version row.
// Real deployment: host the CIM at /share/cim/[id] behind a public read.
// ---------------------------------------------------------------------------
export async function createCimShareLink(versionId: string): Promise<string> {
  // A share is represented by making the version public + generating a link.
  // For real deployments, add a `share_token` + `is_public` column and a public
  // read policy. Here we return the in-app share path.
  const { data } = await supabase.auth.getUser()
  return `/share/cim/${versionId}?token=${''}&sharer=${data?.user?.id || ''}`
}

// ---------------------------------------------------------------------------
// Version control
// ---------------------------------------------------------------------------
export async function fetchCimVersions(listingId: string): Promise<CimVersion[]> {
  const { data, error } = await supabase
    .from('cim_versions')
    .select('*')
    .eq('listing_id', listingId)
    .order('version', { ascending: false })
  if (error) {
    console.error('fetchCimVersions error:', error)
    throw new Error(error.message || 'Failed to load CIM versions')
  }
  return (data as CimVersion[]) || []
}

export async function saveCimVersion(
  listingId: string,
  content: CimContent,
  status: string = 'draft'
): Promise<CimVersion> {
  const versions = await fetchCimVersions(listingId).catch(() => [])
  const nextVersion = versions.length ? versions[0].version + 1 : 1

  const { data, error } = await supabase
    .from('cim_versions')
    .insert({ listing_id: listingId, version: nextVersion, title: content.title, content_json: content, status })
    .select()
    .single()
  if (error) {
    console.error('saveCimVersion error:', error)
    throw new Error(error.message || 'Failed to save CIM version')
  }
  return data as CimVersion
}
