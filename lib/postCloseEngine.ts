/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Post-Close Referral Engine — server-side operations.
// -----------------------------------------------------------------------------
// When a deal closes, schedule the golden-referral sequence: 90-day seller
// check-in → referral ask → testimonial ask → yearly valuation refresh.
// List due check-ins, mark sent/replied/converted (converted → new listing).
// Agency-scoped. Never throws — returns { ok, error? }.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type CheckinType = 'day90' | 'referral_ask' | 'testimonial_ask' | 'yearly_valuation'

export interface CheckinInput {
  agencyId: string
  listingId: string
  dealId?: string | null
  sellerName?: string | null
  sellerEmail?: string | null
  buyerName?: string | null
  buyerEmail?: string | null
  closedAt: string
}

const OFFSETS_DAYS: Record<CheckinType, number> = {
  day90: 90,
  referral_ask: 95,
  testimonial_ask: 100,
  yearly_valuation: 365,
}

/** Schedule the full post-close sequence for a closed deal. */
export async function schedulePostCloseSequence(
  db: SupabaseClient,
  input: CheckinInput,
): Promise<{ ok: boolean; error?: string; created: number }> {
  const types: CheckinType[] = ['day90', 'referral_ask', 'testimonial_ask', 'yearly_valuation']
  const closed = new Date(input.closedAt)
  let created = 0

  for (const t of types) {
    const due = new Date(closed)
    due.setDate(due.getDate() + OFFSETS_DAYS[t])
    const { error } = await db.from('post_close_checkins').insert({
      agency_id: input.agencyId,
      listing_id: input.listingId,
      deal_id: input.dealId || null,
      seller_name: input.sellerName || null,
      seller_email: input.sellerEmail || null,
      buyer_name: input.buyerName || null,
      buyer_email: input.buyerEmail || null,
      closed_at: input.closedAt,
      checkin_type: t,
      status: 'scheduled',
      due_at: due.toISOString(),
    })
    if (!error) created += 1
  }
  return { ok: true, created }
}

export interface DueCheckin {
  id: string
  listing_id: string | null
  seller_name: string | null
  seller_email: string | null
  buyer_name: string | null
  buyer_email: string | null
  checkin_type: CheckinType
  status: string
  due_at: string
  reply: string | null
  converted_listing_id: string | null
}

/** Due (or recently sent) check-ins for an agency, newest due first. */
export async function fetchDueCheckins(
  db: SupabaseClient,
  agencyId: string,
  includeSent = true,
): Promise<{ ok: boolean; items?: DueCheckin[]; error?: string }> {
  let q = db
    .from('post_close_checkins')
    .select('*')
    .eq('agency_id', agencyId)
    .lte('due_at', new Date(Date.now() + 7 * 86400000).toISOString())
    .order('due_at', { ascending: true })
    .limit(200)
  if (!includeSent) q = q.eq('status', 'scheduled')
  const { data, error } = await q
  if (error) return { ok: false, error: error.message }
  return { ok: true, items: (data || []) as DueCheckin[] }
}

/** Mark a check-in sent / replied / skipped. */
export async function updateCheckin(
  db: SupabaseClient,
  agencyId: string,
  checkinId: string,
  patch: { status?: 'sent' | 'replied' | 'converted' | 'skipped'; reply?: string; convertedListingId?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const update: Record<string, unknown> = {}
  if (patch.status) {
    update.status = patch.status
    if (patch.status === 'sent') update.sent_at = new Date().toISOString()
  }
  if (patch.reply !== undefined) update.reply = patch.reply
  if (patch.convertedListingId !== undefined) update.converted_listing_id = patch.convertedListingId
  if (Object.keys(update).length === 0) return { ok: true }

  const { error } = await db.from('post_close_checkins').update(update).eq('id', checkinId).eq('agency_id', agencyId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
