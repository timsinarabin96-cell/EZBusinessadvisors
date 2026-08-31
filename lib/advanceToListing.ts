/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/advanceToListing.ts — #8 one-shot "Advance to Listing" (spec Phase 4).
// -----------------------------------------------------------------------------
// Pulls the validated financialEngine output (recast), the BOV (asking-price
// suggestion + valuation range) and the CIM/interview narrative into the
// public listing fields in ONE action. Tier-gated: paid tier → full AI path;
// free tier → manual-entry only (no AI figures, labeled Self-Reported).
//
// Guardrails (hard):
//   * Never copies unvalidated numbers — the recast must pass the
//     reconciliation invariant (assertRecastConsistency) or the advance is
//     refused with a follow-up flag, never a silent estimate.
//   * Trust label is set from the tier (Self-Reported vs AI-Verified).
//   * Nothing publishes here — this only advances the listing record; the
//     publish gate (identity / legitimacy / seller approval) still applies.
// =============================================================================

import { assertRecastConsistency, type RecastResult } from '@/lib/recast'
import { sellerTierConfig, type SellerTierId } from '@/lib/sellerTiers'

export interface AdvanceToListingInput {
  listingId: string
  businessName: string
  tier: SellerTierId
  recast?: RecastResult | null
  bov?: {
    valuationRange?: string | null
    conclusion?: string | null
    askingPriceSuggestion?: number | null
  } | null
  cim?: {
    narrative?: string | null
  } | null
  interviewDraft?: Record<string, unknown> | null
}

export interface AdvanceToListingOutput {
  ok: boolean
  error?: string
  /** Fields written to the listing record. */
  fields?: Record<string, unknown>
  /** Public trust label for the badge (spec Phase 4). */
  trustLabel?: string
  blocked?: boolean
}

/**
 * Compute the fields that "Advance to Listing" writes. Pure — the route owns
 * the DB write. Returns blocked:true when the tier forbids AI figures or the
 * recast fails the reconciliation invariant (never a silent estimate).
 */
export function buildAdvanceFields(input: AdvanceToListingInput): AdvanceToListingOutput {
  const tier = sellerTierConfig(input.tier)

  // FREE TIER → manual-entry only. No AI figures may be copied in; the listing
  // keeps whatever the seller entered manually and is labeled Self-Reported.
  if (!tier.financialDocuments) {
    return {
      ok: true,
      trustLabel: tier.trustLabel,
      fields: {
        ai_advance_source: 'manual',
        // Keep the seller's own entered numbers untouched; do not overwrite.
        sde: null, // sentinel: route skips null writes
        ebitda: null,
        annual_revenue: null,
        asking_price: null,
      },
    }
  }

  // PAID TIER → full AI path, but the numbers must be VALIDATED first.
  if (!input.recast) {
    return {
      ok: false,
      blocked: true,
      error: 'Advance to Listing requires a validated recast first — run the financial package generation.',
    }
  }
  // Hard guardrail: refuse to advance on an inconsistent recast.
  try {
    assertRecastConsistency(input.recast)
  } catch (e: any) {
    return {
      ok: false,
      blocked: true,
      error: `Reconciliation invariant failed — refusing to advance: ${e?.message || 'unknown'}`,
    }
  }

  const latest = input.recast.years[0]
  const fields: Record<string, unknown> = {
    ai_advance_source: 'ai-verified',
    sde: latest?.recast.sde ?? null,
    ebitda: latest?.recast.ebitda ?? null,
    annual_revenue: latest?.recast.revenue ?? null,
  }

  // Asking-price suggestion from the BOV when present (broker reviews before
  // publish — nothing auto-publishes).
  if (input.bov?.askingPriceSuggestion) {
    fields.asking_price = input.bov.askingPriceSuggestion
  } else if (input.bov?.valuationRange) {
    fields.ai_valuation_range = input.bov.valuationRange
  }
  if (input.bov?.conclusion) fields.ai_valuation_conclusion = input.bov.conclusion

  // Narrative from CIM / interview answers when present.
  if (input.cim?.narrative) fields.description = input.cim.narrative.slice(0, 4000)
  if (input.interviewDraft) {
    const d = input.interviewDraft
    if (typeof d.business_name === 'string' && d.business_name.trim()) fields.business_name = d.business_name.trim().slice(0, 200)
    if (typeof d.headline === 'string' && d.headline.trim()) fields.headline = d.headline.trim().slice(0, 120)
    if (typeof d.industry === 'string' && d.industry.trim()) fields.industry = d.industry.trim().slice(0, 100)
    if (typeof d.location_general === 'string' && d.location_general.trim()) fields.location_general = d.location_general.trim().slice(0, 200)
    if (typeof d.reason_for_sale === 'string' && d.reason_for_sale.trim()) fields.reason_for_sale = d.reason_for_sale.trim().slice(0, 1000)
  }

  return { ok: true, trustLabel: tier.trustLabel, fields }
}
