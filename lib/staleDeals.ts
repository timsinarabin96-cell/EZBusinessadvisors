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

// =============================================================================
// Stale-Draft Scanner (boss 08-31: reuse the stale-deal pattern, don't build a
// separate reminder system)
// -----------------------------------------------------------------------------
// Finds DRAFT listings that have sat untouched (no `updated_at` change) past a
// threshold — i.e. parked waiting on seller input/docs. Same shape as the stale
// scanner above so the same UI + notification plumbing can surface them. The
// nudge fires an in-app notification to the owning agent, deduped so a draft is
// only re-nudged after it's been touched or the notification is read.
// =============================================================================

export interface StaleDraftItem {
  entity_type: 'draft'
  id: string
  label: string
  ref?: string | null
  status?: string | null
  agent_id?: string | null
  updated_at: string | null
  days_since: number
}

/** Pure: days since an ISO timestamp (Infinity when missing). */
export const daysSinceIso = (iso: string | null | undefined): number => {
  if (!iso) return Infinity
  const t = new Date(iso).getTime()
  if (!t) return Infinity
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

/**
 * Scan an agency for draft listings untouched in `thresholdDays` (default 7).
 * Sorted most-stale first. Never throws.
 */
export async function findStaleDrafts(agencyId: string, thresholdDays = 7): Promise<StaleDraftItem[]> {
  if (!svc) return []
  const threshold = new Date(Date.now() - thresholdDays * 86400000).toISOString()
  const { data } = await svc
    .from('listings')
    .select('id, business_name, listing_ref, status, agent_id, updated_at')
    .eq('agency_id', agencyId)
    .in('status', ['draft', 'changes_requested'])
    .lt('updated_at', threshold)
    .limit(200)

  const out: StaleDraftItem[] = (data || []).map((r: any) => ({
    entity_type: 'draft' as const,
    id: r.id,
    label: r.business_name || 'Unnamed draft',
    ref: r.listing_ref || null,
    status: r.status || null,
    agent_id: r.agent_id || null,
    updated_at: r.updated_at || null,
    days_since: daysSinceIso(r.updated_at),
  }))
  out.sort((a, b) => b.days_since - a.days_since)
  return out.slice(0, 100)
}

/**
 * Fire a nudge notification to the owning agent of each stale draft — but only
 * if there is no UNREAD draft-nudge notification already for that listing
 * (dedupe: no spam, no separate reminder system). Returns how many nudges sent.
 */
export async function nudgeStaleDrafts(agencyId: string, thresholdDays = 7): Promise<{ nudged: number; skipped: number }> {
  if (!svc) return { nudged: 0, skipped: 0 }
  const drafts = await findStaleDrafts(agencyId, thresholdDays)
  let nudged = 0
  let skipped = 0

  for (const d of drafts) {
    if (!d.agent_id) { skipped += 1; continue }
    // Dedupe: skip if an unread draft-nudge already exists for this listing.
    const { data: existing } = await svc
      .from('app_notifications')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('profile_id', d.agent_id)
      .eq('kind', 'draft_nudge')
      .is('read_at', null)
      .eq('link', `/dashboard/studio?listing=${d.id}`)
      .limit(1)
    if (existing && existing.length > 0) { skipped += 1; continue }

    const { error } = await svc.from('app_notifications').insert({
      agency_id: agencyId,
      profile_id: d.agent_id,
      title: `⏸ Draft parked ${d.days_since} day${d.days_since === 1 ? '' : 's'} — waiting on seller input`,
      body: `"${d.label}" hasn't been touched in ${d.days_since} day${d.days_since === 1 ? '' : 's'}. Nudge the seller or resume the build.`,
      kind: 'draft_nudge',
      link: `/dashboard/studio?listing=${d.id}`,
    })
    if (error) { skipped += 1; continue }
    nudged += 1
  }
  return { nudged, skipped }
}
