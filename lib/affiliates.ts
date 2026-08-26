/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// AFFILIATE RESOURCES — the "intent" revenue stream (visitor monetization #3).
//
// Every visitor who clicks a partner link can earn a referral commission.
// Payouts (typical, 2026): SBA loan marketplaces $200–500/approved loan,
// payroll $50–150/signup, insurance $25–100/quote, equipment financing
// $50–200/funded, franchise discovery $10–50/lead.
//
// IMPORTANT: `href` must be YOUR affiliate-tagged URL (append your tracking
// ID after joining each program). Placeholders below are plain landing pages
// so nothing renders broken — swap in real affiliate links before promoting.
// =============================================================================

export interface AffiliateLink {
  name: string
  tagline: string
  href: string
  /** Where the link renders: 'guides' | 'financing' | 'footer' */
  surfaces: Array<'guides' | 'financing' | 'footer'>
  /** Commission note shown to you only — never rendered on the page. */
  payoutNote: string
}

export const AFFILIATE_LINKS: AffiliateLink[] = [
  {
    name: 'SBA 7(a) / 504 Loan Marketplaces',
    tagline: 'Compare SBA lenders and get pre-qualified for acquisition financing — 90% of small-business buyers use financing.',
    href: 'https://www.sba.gov/funding-programs/loans/7a-loans',
    surfaces: ['guides', 'financing'],
    payoutNote: '$200–500 per approved loan (Lendio/SmartBiz/Funding Circle)',
  },
  {
    name: 'Payroll & HR (Gusto / ADP)',
    tagline: 'New owners need payroll day one — set up a new business payroll in minutes.',
    href: 'https://gusto.com',
    surfaces: ['guides', 'footer'],
    payoutNote: '$50–150 per paid signup',
  },
  {
    name: 'Business Insurance (Hiscox / Next)',
    tagline: 'Quick quotes for general liability, E&O, and business owner policies.',
    href: 'https://www.hiscox.com',
    surfaces: ['guides', 'footer'],
    payoutNote: '$25–100 per quote',
  },
  {
    name: 'Equipment & Working-Capital Financing',
    tagline: 'Fund equipment, inventory, and working capital after closing.',
    href: 'https://www.fundingcircle.com/us',
    surfaces: ['financing', 'guides'],
    payoutNote: '$50–200 per funded deal',
  },
  {
    name: 'Franchise Discovery',
    tagline: 'Explore vetted franchise opportunities if you are buying into a proven model.',
    href: 'https://www.franchisegator.com',
    surfaces: ['guides'],
    payoutNote: '$10–50 per lead',
  },
  {
    name: 'Business Checking & Banking',
    tagline: 'Separate business banking set up in minutes — keep finances clean from day one.',
    href: 'https://www.mercury.com',
    surfaces: ['guides', 'footer'],
    payoutNote: '$50–200 per funded account',
  },
]

export function affiliateLinksFor(surface: 'guides' | 'financing' | 'footer'): AffiliateLink[] {
  return AFFILIATE_LINKS.filter((l) => l.surfaces.includes(surface))
}
