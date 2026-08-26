/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Communication Log
// -----------------------------------------------------------------------------
// Every call/email/SMS/meeting with any party (seller, buyer, deal, listing),
// with channel/direction/outcome. Auto-reschedules a call-back reminder when a
// call goes unanswered. Server-only; never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { quickReminder } from './reminders'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export type CommChannel = 'call' | 'email' | 'sms' | 'meeting' | 'other'
export type CommDirection = 'outbound' | 'inbound'
export type CommOutcome = 'talked' | 'voicemail' | 'left_message' | 'no_answer' | 'email_sent' | 'email_replied' | 'meeting_held' | 'other'

export interface CommInput {
  agency_id: string
  profile_id?: string | null
  listing_id?: string | null
  buyer_lead_id?: string | null
  seller_lead_id?: string | null
  deal_id?: string | null
  channel?: CommChannel
  direction?: CommDirection
  outcome?: CommOutcome
  contact_name?: string | null
  summary?: string | null
  duration_seconds?: number | null
  /** If the call went unanswered, auto-create a follow-up reminder. */
  auto_reschedule?: boolean
}

/** Log a communication. If unanswered + auto_reschedule, queues a call-back reminder. */
export async function logCommunication(input: CommInput): Promise<{ ok: boolean; error?: string; comm?: Record<string, unknown>; reminder?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }

  const { data, error } = await svc
    .from('communications')
    .insert({
      agency_id: input.agency_id,
      profile_id: input.profile_id || null,
      listing_id: input.listing_id || null,
      buyer_lead_id: input.buyer_lead_id || null,
      seller_lead_id: input.seller_lead_id || null,
      deal_id: input.deal_id || null,
      channel: input.channel || 'call',
      direction: input.direction || 'outbound',
      outcome: input.outcome || 'other',
      contact_name: input.contact_name || null,
      summary: input.summary || null,
      duration_seconds: input.duration_seconds || null,
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }

  // Unanswered outbound call → auto-reschedule a call-back.
  let reminder: Record<string, unknown> | undefined
  if (input.auto_reschedule && input.direction === 'outbound' && (input.outcome === 'no_answer' || input.outcome === 'voicemail' || input.outcome === 'left_message')) {
    const res = await quickReminder(input.agency_id, {
      profileId: input.profile_id || null,
      listingId: input.listing_id || null,
      buyerLeadId: input.buyer_lead_id || null,
      sellerLeadId: input.seller_lead_id || null,
      dealId: input.deal_id || null,
      title: 'Call back — no answer',
      notes: input.summary || null,
      kind: 'call_back',
    })
    if (res.ok && res.reminder) reminder = res.reminder
  }

  return { ok: true, comm: data as Record<string, unknown>, reminder }
}

/** List communications for an agency (optionally filtered). */
export async function listCommunications(
  agencyId: string,
  opts: { listingId?: string; buyerLeadId?: string; sellerLeadId?: string; dealId?: string; limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  let query = svc
    .from('communications')
    .select('*, listings(business_name, listing_ref), buyer_leads(full_name, company), seller_leads(full_name, business_name), deals(title)')
    .eq('agency_id', agencyId)
  if (opts.listingId) query = query.eq('listing_id', opts.listingId)
  if (opts.buyerLeadId) query = query.eq('buyer_lead_id', opts.buyerLeadId)
  if (opts.sellerLeadId) query = query.eq('seller_lead_id', opts.sellerLeadId)
  if (opts.dealId) query = query.eq('deal_id', opts.dealId)
  const { data } = await query.order('created_at', { ascending: false }).limit(opts.limit || 100)
  return (data || []) as Record<string, unknown>[]
}

/** Latest contact timestamp for an entity (null if never contacted). */
export async function lastContactedAt(
  entity: { listingId?: string; buyerLeadId?: string; sellerLeadId?: string; dealId?: string },
): Promise<string | null> {
  if (!svc) return null
  let query = svc.from('communications').select('created_at').order('created_at', { ascending: false }).limit(1)
  if (entity.listingId) query = query.eq('listing_id', entity.listingId)
  if (entity.buyerLeadId) query = query.eq('buyer_lead_id', entity.buyerLeadId)
  if (entity.sellerLeadId) query = query.eq('seller_lead_id', entity.sellerLeadId)
  if (entity.dealId) query = query.eq('deal_id', entity.dealId)
  const { data } = await query.maybeSingle()
  return (data?.created_at as string) || null
}
