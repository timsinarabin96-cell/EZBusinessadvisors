/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Pricing policy — no public prices, per brokerage rule.
// Public surfaces show "Price available on application" + a soft teaser band.
// Exact prices appear ONLY in business materials (NDA-gated financials / CIM).
// =============================================================================

export interface Pricable {
  asking_price: number | null
  currency_code?: string | null
}

const BANDS: { max: number; label: string }[] = [
  { max: 250_000, label: 'Priced under $250k' },
  { max: 500_000, label: 'Priced $250k – $500k' },
  { max: 1_000_000, label: 'Priced $500k – $1M' },
  { max: 2_500_000, label: 'Priced $1M – $2.5M' },
  { max: 5_000_000, label: 'Priced $2.5M – $5M' },
  { max: 10_000_000, label: 'Priced $5M – $10M' },
]

/** Soft public teaser — a range, never the exact price. */
export function priceTeaser(listing: Pricable): string | null {
  if (listing.asking_price == null) return null
  for (const band of BANDS) {
    if (listing.asking_price <= band.max) return band.label
  }
  return 'Priced over $10M'
}

/** Exact price — ONLY for business materials (post-NDA). */
export function exactPrice(listing: Pricable): string | null {
  if (listing.asking_price == null) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: listing.currency_code || 'USD',
    maximumFractionDigits: 0,
  }).format(listing.asking_price)
}

export const PRICING_CTA = 'Price available on application'
export const PRICING_HINT = 'Fill out an application or talk with an agent for pricing.'
