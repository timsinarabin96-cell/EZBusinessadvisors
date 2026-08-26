/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// sellerPortal — client wrapper for the seller self-service portal.
// Sellers open their private link (/seller/<token>) to see valuation progress,
// live listing views, buyer interest, and next steps. Token is the auth —
// same pattern as the lender portal; no login needed.
// =============================================================================

export interface SellerPortalData {
  ok: boolean
  error?: string
  lead: {
    id: string
    business_name: string | null
    industry: string | null
    location_general: string | null
    status: string | null
    source: string | null
    created_at: string | null
  } | null
  listing: {
    id: string
    agency_id: string | null
    listing_ref: string | null
    business_name: string | null
    industry: string | null
    location_general: string | null
    asking_price: number | null
    annual_revenue: number | null
    sde: number | null
    ebitda: number | null
    status: string | null
    published: boolean
  } | null
  stats: {
    views7d: number
    viewsTotal: number
    ndaRequests: number
  }
  financials: {
    docs: {
      id: string
      file_name: string
      file_url: string
      fiscal_year: number | null
      category: string
      upload_source: string
      status: string
    }[]
    preview: {
      revenue: number | null
      sde: number | null
      ebitda: number | null
      valueRangeLow: number | null
      valueRangeHigh: number | null
    } | null
  }
  nextSteps: string[]
}

export async function fetchSellerPortal(token: string): Promise<SellerPortalData> {
  const empty: SellerPortalData = {
    ok: false,
    lead: null,
    listing: null,
    stats: { views7d: 0, viewsTotal: 0, ndaRequests: 0 },
    financials: { docs: [], preview: null },
    nextSteps: [],
  }
  try {
    const res = await fetch(`/api/seller-portal?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
    return res.json().catch(() => empty)
  } catch {
    return empty
  }
}

/** Seller self-upload of a financial document (token-gated). */
export async function uploadSellerFinancial(token: string, file: File, fiscalYear?: number): Promise<{ ok: boolean; error?: string; doc?: unknown }> {
  const form = new FormData()
  form.set('token', token)
  if (fiscalYear) form.set('fiscalYear', String(fiscalYear))
  form.set('file', file)
  try {
    const res = await fetch('/api/seller-portal', { method: 'POST', body: form })
    return res.json().catch(() => ({ ok: false, error: 'Upload failed' }))
  } catch {
    return { ok: false, error: 'Upload failed' }
  }
}

/** Seller removal of a mistakenly uploaded document (token-gated). */
export async function deleteSellerFinancial(token: string, docId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/seller-portal?token=${encodeURIComponent(token)}&docId=${encodeURIComponent(docId)}`, { method: 'DELETE' })
    return res.json().catch(() => ({ ok: false, error: 'Delete failed' }))
  } catch {
    return { ok: false, error: 'Delete failed' }
  }
}

/** Human label for a seller lead status. */
export const leadStatusLabel = (s: string | null | undefined): string => {
  const map: Record<string, string> = {
    new: 'In review',
    contacted: 'Contacted',
    qualifying: 'Qualifying',
    qualified: 'Qualified',
    closed: 'Closed',
    handed_off: 'Handed off',
  }
  return map[s || ''] || s || 'In review'
}
