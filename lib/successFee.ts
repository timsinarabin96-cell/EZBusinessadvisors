/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Success-fee engine — the platform's transaction cut on closed deals.
// -----------------------------------------------------------------------------
// Tiered success fee: the platform takes a percentage of the final sale price
// when a deal closes. Default tiers:
//   * 3% on the first $1,000,000
//   * 2% on $1M – $2M
//   * 1% on anything above $2M
// Fees are recorded idempotently when the closing milestone completes, then
// invoiced via Stripe when configured (demo fallback: recorded only).
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface SuccessFeeTier {
  /** Fee percent expressed as a decimal (0.03 = 3%). */
  rate: number
  /** Upper bound of the bracket in dollars (null = no upper bound). */
  upTo: number | null
}

/** Default tiered schedule — override per-agency later via agency_settings. */
export const SUCCESS_FEE_TIERS: SuccessFeeTier[] = [
  { rate: 0.03, upTo: 1_000_000 },
  { rate: 0.02, upTo: 2_000_000 },
  { rate: 0.01, upTo: null },
]

/**
 * Compute the success fee for a sale price using the tiered schedule.
 * Returns the blended fee in dollars.
 */
export function calculateSuccessFee(salePrice: number, tiers: SuccessFeeTier[] = SUCCESS_FEE_TIERS): number {
  if (!salePrice || salePrice <= 0) return 0
  let remaining = salePrice
  let prevBound = 0
  let total = 0
  for (const tier of tiers) {
    const bound = tier.upTo ?? salePrice
    const bracket = Math.min(Math.max(bound - prevBound, 0), remaining)
    total += bracket * tier.rate
    remaining -= bracket
    prevBound = bound
    if (remaining <= 0) break
  }
  return Math.round(total * 100) / 100
}

export interface SuccessFeeInput {
  agencyId: string
  listingId: string
  dealId?: string | null
  salePrice: number
  notes?: string | null
}

export interface SuccessFeeRecord {
  id: string
  agency_id: string
  listing_id: string
  deal_id: string | null
  sale_price: number
  fee_percent: number
  fee_cents: number
  status: string
  created_at: string | null
}

/**
 * Record a success fee for a closed deal. Idempotent per (listing_id, deal_id).
 * Returns the fee record (or the existing one if already recorded).
 */
export async function recordSuccessFee(input: SuccessFeeInput): Promise<{ ok: boolean; error?: string; fee?: SuccessFeeRecord }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!input.agencyId || !input.listingId || !input.salePrice || input.salePrice <= 0) {
    return { ok: false, error: 'agencyId, listingId, and a positive sale price are required' }
  }

  const feeDollars = calculateSuccessFee(input.salePrice)
  const feeCents = Math.round(feeDollars * 100)
  const feePercent = feeDollars > 0 ? feeDollars / input.salePrice : 0

  // Idempotent: fetch existing record for (listing_id, deal_id) first.
  const q = svc.from('deal_success_fees').select('*')
  q.eq('listing_id', input.listingId)
  if (input.dealId) q.eq('deal_id', input.dealId)
  const { data: existing } = await q.maybeSingle()
  if (existing) {
    return { ok: true, fee: existing as SuccessFeeRecord, error: undefined }
  }

  const { data, error } = await svc
    .from('deal_success_fees')
    .insert({
      agency_id: input.agencyId,
      listing_id: input.listingId,
      deal_id: input.dealId || null,
      sale_price: input.salePrice,
      fee_percent: feePercent,
      fee_cents: feeCents,
      status: 'recorded',
      notes: input.notes || null,
    })
    .select()
    .single()

  if (error) {
    // Race-safe: if two requests hit at once, the unique constraint wins.
    if (String(error.message).match(/duplicate|unique/i)) {
      const { data: dup } = await svc
        .from('deal_success_fees')
        .select('*')
        .eq('listing_id', input.listingId)
        .maybeSingle()
      if (dup) return { ok: true, fee: dup as SuccessFeeRecord }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true, fee: data as SuccessFeeRecord }
}


