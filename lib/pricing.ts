/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/pricing.ts — THE single source of truth for every price in the system.
// -----------------------------------------------------------------------------
// Every surface (convert-trial, billing, Stripe checkout, Stripe webhook,
// license page, pricing page, upsell panels) imports from here. If a price
// changes, it changes in ONE file — drift is impossible.
//
// 2026-08-28 tiered pricing (boss: "build the tiered pricing page"):
//   * Professional: $499/mo (annual $4,790 — 2 months free) · 10 listings · 5 seats
//   * Enterprise:   $899/mo (annual $8,630 — 2 months free) · 25 listings · 15 seats
//   * License:      $4,999 one-time setup + $499/mo platform fee
//   * Buyer Pass:   $49/$99 — SEPARATE product (buyers, not brokerages);
//     kept distinct so it never reads as the CRM price.
// Every billing surface imports these constants — change prices HERE only.
// =============================================================================

export interface PricePlan {
  id: string
  name: string
  monthly: number
  annual: number
  icon: string
  tagline: string
  features: string[]
  cta: string
  highlighted?: boolean
  listings?: number // active marketplace listings included in the tier
  seats?: number    // agent seats included in the tier
}

// ---------------------------------------------------------------------------
// CRM subscription tiers (brokerages)
// ---------------------------------------------------------------------------
export const CRM_MONTHLY = 499
export const CRM_ANNUAL = 4790 // 20% off ≈ 2 months free
export const CRM_ENTERPRISE_MONTHLY = 899
export const CRM_ENTERPRISE_ANNUAL = 8630 // 20% off ≈ 2 months free

export const CRM_PLANS: PricePlan[] = [
  {
    id: 'free',
    name: 'Owner',
    monthly: 0,
    annual: 0,
    icon: '🔑',
    tagline: 'For business owners — list your business for sale',
    features: [
      '1 active listing on the marketplace',
      'Login + add your listing',
      'Buyer inquiry notifications',
      'No CRM system',
    ],
    cta: 'Get Started Free',
  },
  {
    id: 'professional',
    name: 'Professional',
    monthly: CRM_MONTHLY,
    annual: CRM_ANNUAL,
    icon: '💼',
    tagline: 'For brokerages posting on our marketplace',
    highlighted: true,
    listings: 10,
    seats: 5,
    features: [
      'Deal pipeline (1 board)',
      'Lead management',
      'CIM & BOV generation',
      'Email support',
    ],
    cta: 'Start Free Trial',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly: CRM_ENTERPRISE_MONTHLY,
    annual: CRM_ENTERPRISE_ANNUAL,
    icon: '🏛️',
    tagline: 'For larger teams and agencies',
    listings: 25,
    seats: 15,
    features: [
      'Everything in Professional',
      'Multi-board deal pipeline',
      'Financial recasting engine',
      'Priority support',
    ],
    cta: 'Start Free Trial',
  },
]

// ---------------------------------------------------------------------------
// White-label CRM license (separate product from the subscription tiers)
// ---------------------------------------------------------------------------
export const LICENSE_SETUP_FEE = 4999 // one-time
export const LICENSE_MONTHLY = 499 // recurring platform fee

export const CRM_LICENSE = {
  name: 'Concord CRM Platform',
  setupFee: LICENSE_SETUP_FEE,
  monthly: LICENSE_MONTHLY,
  includes: [
    'Full CRM system (deal pipeline, leads, CIM/BOV, recasting)',
    'AI agents (DeepSeek/Claude via your own API keys)',
    'White-label branding & your own subdomain',
    'Buyer portal, NDA workflow, documents, e-sign',
    'Own Supabase + storage (you pay infrastructure)',
    'All API token costs billed to you',
  ],
} as const

// ---------------------------------------------------------------------------
// Owner listing plans (free entry + paid renewals/upsells)
// ---------------------------------------------------------------------------
export const OWNER_LISTING_PLANS = [
  {
    id: 'free', name: 'Free Listing', price: 0, billing: 'first 2 months',
    description: 'One-time free listing for business owners. Free for the first 2 months, then $50/month per listing to stay live.',
    features: ['1 free listing for 2 months', 'Confidential by default', 'Buyer inquiry notifications', 'Renew at $50/mo after the free window'],
    featured: true,
  },
  {
    id: 'professional', name: 'Owner Renewal', price: 50, billing: 'per listing / month',
    description: 'Keep your listing live after the free window.',
    features: ['Listing stays live', 'Unlimited inquiries', 'Cancel anytime'],
    featured: false,
  },
] as const

// ---------------------------------------------------------------------------
// Add-on pricing (declared before LISTING_UPSELL_OPTIONS references them)
// ---------------------------------------------------------------------------
export const FINANCIAL_INTELLIGENCE_MONTHLY = 100   // the $100/mo upsell

export const VERIFIED_REVENUE_PRICE = 199            // one-time bank-vs-books badge

export const VALUATION_PRICE = 99                     // one-time professional valuation report (owner upsell)

// Upsell options — sold to FREE owner listings. Kept separate from
// OWNER_LISTING_PLANS (which drives the sell-page order flow) so the upsell
// panel can grow without touching the listing-order zod enum.
export interface UpsellOption {
  id: string
  name: string
  price: number
  billing: string
  description: string
  features: string[]
  icon: string
  checkoutProduct: string
}

export const LISTING_UPSELL_OPTIONS: UpsellOption[] = [
  {
    id: 'featured_30', name: 'Featured 30 days', price: 149, billing: 'one-time',
    description: 'Top of the public feed + homepage carousel for 30 days.',
    features: ['Top placement', '★ Featured badge', 'More buyer views'],
    icon: '⭐',
    checkoutProduct: 'featured',
  },
  {
    id: 'featured_90', name: 'Featured 90 days', price: 349, billing: 'one-time',
    description: 'Best value — top placement for 90 days.',
    features: ['Top placement for 3 months', '★ Featured badge', 'Weekly spotlight eligibility'],
    icon: '🚀',
    checkoutProduct: 'featured',
  },
  {
    id: 'verified_revenue', name: 'Verified Revenue badge', price: 199, billing: 'one-time',
    description: 'Bank-vs-books verification with a public ✅ Verified Revenue badge.',
    features: ['Bank statement review', '✅ Verified badge on the listing', 'Buyer trust boost'],
    icon: '✅',
    checkoutProduct: 'verified_revenue',
  },
  {
    id: 'financial_intelligence', name: 'Financial Intelligence', price: FINANCIAL_INTELLIGENCE_MONTHLY, billing: '/month',
    description: 'AI reads your P&L, bank statements & POS summaries into a broker-grade recast.',
    features: ['Universal document reader', 'Multi-year recast & valuation', 'Bank-vs-books check'],
    icon: '🧠',
    checkoutProduct: 'financial_intelligence',
  },
]

// ---------------------------------------------------------------------------
// Launch Kit — the $399 bundle (valuation + featured 30d + verified revenue).
// Value if bought separately: $447. Sold right after a listing goes live.
// ---------------------------------------------------------------------------
export const LAUNCH_KIT_PRICE = 399

export const LAUNCH_KIT = {
  name: 'Launch Kit',
  price: LAUNCH_KIT_PRICE,
  value: 447,
  blurb: 'Valuation report + 30-day featured placement + Verified Revenue badge — the full trust & visibility launch for your listing.',
  includes: ['📊 Broker Opinion of Value report', '⭐ 30 days featured placement', '✅ Verified Revenue badge (bank-vs-books)'],
} as const

// ---------------------------------------------------------------------------
// Cents helpers (Stripe wants integer cents)
// ---------------------------------------------------------------------------
export const cents = (dollars: number): number => Math.round(dollars * 100)
export const LAUNCH_KIT_PRICE_CENTS = cents(LAUNCH_KIT_PRICE)
export const CRM_MONTHLY_CENTS = cents(CRM_MONTHLY)
export const CRM_ANNUAL_CENTS = cents(CRM_ANNUAL)
export const CRM_ENTERPRISE_MONTHLY_CENTS = cents(CRM_ENTERPRISE_MONTHLY)
export const CRM_ENTERPRISE_ANNUAL_CENTS = cents(CRM_ENTERPRISE_ANNUAL)
export const LICENSE_SETUP_CENTS = cents(LICENSE_SETUP_FEE)
export const LICENSE_MONTHLY_CENTS = cents(LICENSE_MONTHLY)
export const FINANCIAL_INTELLIGENCE_CENTS = cents(FINANCIAL_INTELLIGENCE_MONTHLY)
export const VERIFIED_REVENUE_PRICE_CENTS = cents(VERIFIED_REVENUE_PRICE)
export const VALUATION_PRICE_CENTS = cents(VALUATION_PRICE)

// ---------------------------------------------------------------------------
// CRM license SUBSCRIPTION seats (Phase 3, locked 08-31): 3 seats included in
// the base plan, +$25/seat/mo after. Annual seat = $250 (2 months free parity,
// same 20%-off shape as the base plans).
// ---------------------------------------------------------------------------
export const LICENSE_SEATS_INCLUDED = 3
export const SEAT_ADDON_MONTHLY = 25
export const SEAT_ADDON_ANNUAL = 250 // 25 * 10 months (2 months free parity)
export const SEAT_ADDON_MONTHLY_CENTS = cents(SEAT_ADDON_MONTHLY)
export const SEAT_ADDON_ANNUAL_CENTS = cents(SEAT_ADDON_ANNUAL)
