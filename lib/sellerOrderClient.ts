/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Seller self-service client helpers (pay-to-list)
// =============================================================================

export interface SellerOrderPayload {
  planId: 'free' | 'professional' | 'enterprise'
  agencySlug?: string
  business_name: string
  industry?: string | null
  location_general?: string | null
  description?: string | null
  asking_price?: number | null
  annual_revenue?: number | null
  sde?: number | null
  established_year?: number | null
  seller_email: string
  seller_name?: string | null
  seller_phone?: string | null
  attestation?: boolean
  provider?: string
  providerSessionId?: string
}

export interface SellerOrderResponse {
  ok: boolean
  error?: string
  order?: Record<string, unknown>
  listing?: Record<string, unknown>
  message?: string
}

/** Submit a seller listing order to the broker review queue. */
export async function submitSellerListingOrder(payload: SellerOrderPayload): Promise<SellerOrderResponse> {
  try {
    const res = await fetch('/api/marketplace/seller-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as SellerOrderResponse
    if (!res.ok) return { ok: false, error: data.error || 'Submission failed' }
    return data
  } catch {
    return { ok: false, error: 'Network error — please try again.' }
  }
}
