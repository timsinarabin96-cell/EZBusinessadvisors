/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/sellerTiers.ts — seller self-serve tiers (spec Phase 1, #2).
// -----------------------------------------------------------------------------
// Free tier  — self-serve, manual-entry only, NO AI extraction / advisor
//              interview / BOV / Recast / CIM. Listing is labeled
//              "Self-Reported" on the public marketplace. Legal-doc gate still
//              applies (no exceptions). Low engagement triggers an upgrade
//              prompt; declining routes to "work with a licensed advisor".
// Paid tier  — full AI path: advisor interview + universal ingestion +
//              BOV/Recast/CIM via the validated financialEngine. Listing is
//              labeled "AI-Verified Financials".
//
// All limits / prices are CONFIGURABLE constants here (single source of
// truth) so the boss can adjust without touching call sites. Defaults chosen
// sensibly; flagged for review in the consolidated report.
// =============================================================================

export type SellerTierId = 'free' | 'paid'

export interface SellerTierConfig {
  id: SellerTierId
  name: string
  /** Max simultaneously-active self-serve listings on this tier. */
  maxActiveListings: number
  /** Free tier → manual form only; paid → advisor interview + AI ingestion. */
  aiIntake: boolean
  /** Paid tier → BOV/Recast/CIM generation; free → never. */
  financialDocuments: boolean
  /** Public trust label (spec Phase 4). */
  trustLabel: 'Self-Reported' | 'AI-Verified Financials'
  /** One-time / per-listing price in USD (paid tier). 0 for free. */
  priceUsd: number
  /** Billing note shown on the sell page. */
  billing: string
  /** Free-tier decline → capture "work with a licensed advisor" lead. */
  advisorRouting: boolean
}

export const SELLER_TIER_DEFAULTS: Record<SellerTierId, SellerTierConfig> = {
  free: {
    id: 'free',
    name: 'Free Listing',
    maxActiveListings: 1,
    aiIntake: false,
    financialDocuments: false,
    trustLabel: 'Self-Reported',
    priceUsd: 0,
    billing: 'Free — manual entry only',
    advisorRouting: true,
  },
  paid: {
    id: 'paid',
    name: 'AI-Verified Listing',
    maxActiveListings: 5,
    aiIntake: true,
    financialDocuments: true,
    trustLabel: 'AI-Verified Financials',
    priceUsd: 250, // $250/listing one-time — explicit boss decision (undersells vs $2,500 human-agent BOV at $19)
    billing: '$250 one-time per listing',
    advisorRouting: false,
  },
}

export const SELLER_TIERS: SellerTierConfig[] = [SELLER_TIER_DEFAULTS.free, SELLER_TIER_DEFAULTS.paid]

export function sellerTierConfig(tier: SellerTierId | string | null | undefined): SellerTierConfig {
  return SELLER_TIER_DEFAULTS[tier === 'paid' ? 'paid' : 'free']
}

/** Map the marketplace order planId onto a seller tier. */
export function tierFromPlanId(planId: string | null | undefined): SellerTierId {
  // 'professional' / 'enterprise' orders are paid listing plans → paid tier.
  return planId === 'professional' || planId === 'enterprise' ? 'paid' : 'free'
}

/** True when this listing's tier may run the AI intake path. */
export function tierAllowsAiIntake(tier: SellerTierId | string | null | undefined): boolean {
  return sellerTierConfig(tier).aiIntake
}

/** True when this listing's tier may generate BOV/Recast/CIM. */
export function tierAllowsFinancialDocuments(tier: SellerTierId | string | null | undefined): boolean {
  return sellerTierConfig(tier).financialDocuments
}

/** Public trust label for a listing (spec Phase 4 badge). */
export function trustLabelForTier(tier: SellerTierId | string | null | undefined): string {
  return sellerTierConfig(tier).trustLabel
}

/** Resolve the tier for a listing row (reads seller_tier, falls back to free). */
export function tierOfListing(listing: { seller_tier?: string | null } | null | undefined): SellerTierId {
  return listing?.seller_tier === 'paid' ? 'paid' : 'free'
}
