/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Stale-Deal Scanner
// -----------------------------------------------------------------------------
// Finds listings / buyer leads / seller leads / deals that haven't been
// contacted in N days, so brokers never lose a warm deal. Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { lastContactedAt } from './communications'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface StaleItem {
  entity_type: 'listing' | 'buyer' | 'seller' | 'deal'
  id: string
  label: string
  ref?: string | null
  status?: string | null
  last_contacted_at: string | null
  days_since: number
}

/**
 * Scan an agency for entities with no contact in `thresholdDays` (default 14).
 * Returns items sorted by staleness (most stale first). Never throws.
 */
export async function findStaleDeals(agencyId: string, thresholdDays = 14): Promise<StaleItem[]> {
  if (!svc) return []
  const threshold = new Date(Date.now() - thresholdDays * 86400000)
  const stale: StaleItem[] = []

  const collect = async (rows: any[], type: StaleItem['entity_type'], labelOf: (r: any) => string, refOf?: (r: any) => string | null, key?: string) => {
    for (const row of rows || []) {
      const id = row.id
      const last = await lastContactedAt(key ? { [key]: id } : { listingId: id })
      if (last && new Date(last) >= threshold) continue
      stale.push({
        entity_type: type,
        id,
        label: labelOf(row),
        ref: refOf ? refOf(row) : null,
        status: row.status || null,
        last_contacted_at: last,
        days_since: last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : Infinity,
      })
    }
  }

  const [listings, buyers, sellers, deals] = await Promise.all([
    svc.from('listings').select('id, business_name, listing_ref, status').eq('agency_id', agencyId).in('status', ['active', 'under_loi', 'approved', 'pending']).limit(200),
    svc.from('buyer_leads').select('id, full_name, company, status').eq('agency_id', agencyId).limit(200),
    svc.from('seller_leads').select('id, full_name, business_name, status').eq('agency_id', agencyId).limit(200),
    svc.from('deals').select('id, title, status').eq('agency_id', agencyId).limit(200),
  ])

  await Promise.all([
    collect(listings.data, 'listing', (r) => r.business_name || 'Listing', (r) => r.listing_ref, 'listingId'),
    collect(buyers.data, 'buyer', (r) => r.full_name || r.company || 'Buyer', undefined, 'buyerLeadId'),
    collect(sellers.data, 'seller', (r) => r.business_name || r.full_name || 'Seller', undefined, 'sellerLeadId'),
    collect(deals.data, 'deal', (r) => r.title || 'Deal', undefined, 'dealId'),
  ])

  stale.sort((a, b) => (b.days_since || 0) - (a.days_since || 0))
  return stale.slice(0, 100)
}
