/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/franchise.ts — FRANCHISE OPPORTUNITIES core (Stage 1).
// -----------------------------------------------------------------------------
// Franchises have no operating revenue/SDE history, so they do NOT go through
// the recast/BOV/CIM pipeline. This module owns the franchise-specific domain:
//   * franchise_details (1:1 with listings) — brand, investment range, fees,
//     territories, units, training, ideal candidate, optional Item 19 PDF
//   * franchise_subscriptions — the recurring $299/mo Stripe subscription per
//     franchise brand listing
//   * AUTO-PUBLISH on payment (boss-approved): the webhook activates the
//     subscription and publishes the listing immediately — no 24h delay. A
//     lightweight AI sanity check runs AFTER publish and only FLAGS issues
//     (it never blocks a paid listing).
//   * Monthly-only (boss-approved): no annual option.
//
// The pure, testable helpers live here; network/DB work is in the API routes
// (stripe checkout/webhook + /api/franchise).
// =============================================================================

import { FRANCHISE_MONTHLY, FRANCHISE_MONTHLY_CENTS } from '@/lib/pricing'

export const FRANCHISE_PLAN_ID = 'franchise_monthly'
export const FRANCHISE_PLAN_NAME = 'Franchise Listing'
export const FRANCHISE_PRICE = FRANCHISE_MONTHLY
export const FRANCHISE_PRICE_CENTS = FRANCHISE_MONTHLY_CENTS

export interface FranchiseDetailsInput {
  brand_name: string
  industry_category?: string | null
  total_investment_min?: number | null
  total_investment_max?: number | null
  franchise_fee?: number | null
  royalty_fee_pct?: number | null
  territories_available?: string | null
  existing_units?: number | null
  training_support?: string | null
  ideal_candidate_liquid_capital?: number | null
  ideal_candidate_net_worth?: number | null
  item19_document_id?: string | null
}

export interface FranchiseDetails extends FranchiseDetailsInput {
  id: string
  listing_id: string
  created_at: string
  updated_at: string
}

export type FranchiseSubStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface FranchiseSubscription {
  id: string
  listing_id: string
  status: FranchiseSubStatus
  stripe_customer: string | null
  stripe_sub: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

/** Investment range display, e.g. "$150K – $350K" or "From $150K". */
export function formatInvestmentRange(min: number | null | undefined, max: number | null | undefined): string {
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
      : n >= 1_000 ? `$${Math.round(n / 1_000)}K`
        : `$${n.toLocaleString()}`
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`
  if (min != null) return `From ${fmt(min)}`
  if (max != null) return `Up to ${fmt(max)}`
  return 'Not disclosed'
}

/** Royalty display: "6% of gross revenue" or "Not disclosed". */
export function formatRoyalty(pct: number | null | undefined): string {
  return pct != null ? `${pct}% of gross revenue` : 'Not disclosed'
}

/**
 * Post-publish AI sanity check — runs AFTER the listing is live (boss-approved
 * order: publish first, flag later, never block a paid listing). Returns a
 * list of advisory flags; empty array = nothing to flag.
 */
export function franchiseSanityFlags(details: Partial<FranchiseDetailsInput>): string[] {
  const flags: string[] = []
  if (!details.brand_name?.trim()) flags.push('No brand name set')
  if (details.total_investment_min == null && details.total_investment_max == null) {
    flags.push('Total investment range not disclosed — buyers expect a range')
  }
  if (details.franchise_fee == null) flags.push('Franchise fee not disclosed')
  if (details.royalty_fee_pct == null) flags.push('Royalty fee not disclosed')
  if (!details.territories_available?.trim()) flags.push('Territories available not described')
  if (details.existing_units == null) flags.push('Number of existing units not disclosed (proof of concept)')
  if (!details.training_support?.trim()) flags.push('Training/support offering not described')
  if (details.ideal_candidate_liquid_capital == null && details.ideal_candidate_net_worth == null) {
    flags.push('Ideal candidate financial profile not disclosed')
  }
  if (details.total_investment_min != null && details.total_investment_max != null && details.total_investment_max < details.total_investment_min) {
    flags.push('Investment max is below investment min — check the range')
  }
  return flags
}

/** Whether a franchise listing is publishable (minimum viable record). */
export function franchisePublishable(details: Partial<FranchiseDetailsInput>): boolean {
  return Boolean(details.brand_name?.trim())
}

// ---------------------------------------------------------------------------
// Billing lifecycle labels
// ---------------------------------------------------------------------------

export const FRANCHISE_SUB_STATUS_LABEL: Record<FranchiseSubStatus, string> = {
  trialing: 'Trialing',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
}
