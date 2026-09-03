/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Seller Call-Back Reminders
// -----------------------------------------------------------------------------
// Per-listing reminders for calling sellers back, following up, and tasks.
// Includes a smart "next call time" suggester (business-hours aware).
// Server-only; never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export type ReminderKind = 'call_back' | 'follow_up' | 'task' | 'meeting'
export type ReminderStatus = 'pending' | 'done' | 'cancelled'

export interface ReminderInput {
  agency_id: string
  profile_id?: string | null
  listing_id?: string | null
  buyer_lead_id?: string | null
  seller_lead_id?: string | null
  deal_id?: string | null
  title: string
  notes?: string | null
  kind?: ReminderKind
  due_at: string
}

/** Create a reminder for any entity (listing, buyer lead, seller lead, deal, or plain task). */
export async function createReminder(input: ReminderInput): Promise<{ ok: boolean; error?: string; reminder?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!input.title?.trim()) return { ok: false, error: 'title is required' }
  if (!input.due_at) return { ok: false, error: 'due_at is required' }

  const { data, error } = await svc
    .from('reminders')
    .insert({
      agency_id: input.agency_id,
      profile_id: input.profile_id || null,
      listing_id: input.listing_id || null,
      buyer_lead_id: input.buyer_lead_id || null,
      seller_lead_id: input.seller_lead_id || null,
      deal_id: input.deal_id || null,
      title: input.title.trim(),
      notes: input.notes || null,
      kind: input.kind || 'call_back',
      due_at: input.due_at,
      status: 'pending',
    })
    .select()
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, reminder: data as Record<string, unknown> }
}

/** List reminders for an agency, optionally filtered by status/kind/entity. */
export async function listReminders(
  agencyId: string,
  opts: { status?: string; kind?: string; listingId?: string; buyerLeadId?: string; sellerLeadId?: string; dealId?: string; limit?: number } = {},
): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  let query = svc
    .from('reminders')
    .select('*, listings(business_name, listing_ref), buyer_leads(full_name, company), seller_leads(full_name, business_name), deals(title, purchase_price)')
    .eq('agency_id', agencyId)
  if (opts.status && opts.status !== 'all') query = query.eq('status', opts.status)
  if (opts.kind && opts.kind !== 'all') query = query.eq('kind', opts.kind)
  if (opts.listingId) query = query.eq('listing_id', opts.listingId)
  if (opts.buyerLeadId) query = query.eq('buyer_lead_id', opts.buyerLeadId)
  if (opts.sellerLeadId) query = query.eq('seller_lead_id', opts.sellerLeadId)
  if (opts.dealId) query = query.eq('deal_id', opts.dealId)
  const { data } = await query.order('due_at', { ascending: true }).limit(opts.limit || 100)
  return (data || []) as Record<string, unknown>[]
}

/** Mark a reminder done (or reopen). */
export async function setReminderStatus(
  reminderId: string,
  status: ReminderStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const patch: Record<string, unknown> = { status }
  if (status === 'done') patch.completed_at = new Date().toISOString()
  if (status === 'pending') patch.completed_at = null
  const { error } = await svc.from('reminders').update(patch).eq('id', reminderId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Snooze a reminder — push its due date out by the given minutes. */
export async function snoozeReminder(
  reminderId: string,
  minutes: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!Number.isFinite(minutes) || minutes <= 0) return { ok: false, error: 'minutes must be positive' }
  const next = new Date(Date.now() + minutes * 60000).toISOString()
  const { error } = await svc.from('reminders').update({ due_at: next, status: 'pending', completed_at: null }).eq('id', reminderId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Delete a reminder. */
export async function deleteReminder(reminderId: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { error } = await svc.from('reminders').delete().eq('id', reminderId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Counts for dashboard widgets: due today, overdue, upcoming. */
export async function reminderCounts(agencyId: string): Promise<{ dueToday: number; overdue: number; upcoming: number; pending: number }> {
  if (!svc) return { dueToday: 0, overdue: 0, upcoming: 0, pending: 0 }
  const now = new Date()
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  const { data } = await svc
    .from('reminders')
    .select('due_at, status')
    .eq('agency_id', agencyId)
    .eq('status', 'pending')
    .limit(500)

  let dueToday = 0
  let overdue = 0
  let upcoming = 0
  for (const r of data || []) {
    const due = new Date(r.due_at as string)
    if (due < now) overdue++
    else if (due <= endOfDay) dueToday++
    else upcoming++
  }
  return { dueToday, overdue, upcoming, pending: (data || []).length }
}

/**
 * Smart next-call suggester: business hours (9a–6p ET), never on weekends,
 * defaults to tomorrow 10am unless a nearer pending reminder exists.
 */
export function suggestNextCallTime(existingDue?: string | null): string {
  const d = new Date()
  const day = d.getDay()
  if (day === 6) d.setDate(d.getDate() + 2) // Sat → Mon
  else if (day === 0) d.setDate(d.getDate() + 1) // Sun → Mon
  else if (d.getHours() >= 17) d.setDate(d.getDate() + 1) // after 5pm → next day
  d.setHours(10, 0, 0, 0)
  // If a pending reminder is due sooner, nudge to just after it.
  if (existingDue) {
    const existing = new Date(existingDue)
    if (existing > new Date() && existing < d) {
      const nudge = new Date(existing)
      nudge.setHours(nudge.getHours() + 2)
      return nudge.toISOString()
    }
  }
  return d.toISOString()
}

/** Quick-create a reminder for any entity (listing / buyer lead / seller lead / deal). */
export async function quickReminder(
  agencyId: string,
  opts: {
    profileId?: string | null
    listingId?: string | null
    buyerLeadId?: string | null
    sellerLeadId?: string | null
    dealId?: string | null
    title?: string
    notes?: string | null
    kind?: ReminderKind
    dueAt?: string
  } = {},
): Promise<{ ok: boolean; error?: string; reminder?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }

  let label = ''
  if (opts.listingId) {
    const { data } = await svc.from('listings').select('business_name').eq('id', opts.listingId).maybeSingle()
    label = data?.business_name || 'listing'
  } else if (opts.buyerLeadId) {
    const { data } = await svc.from('buyer_leads').select('full_name, company').eq('id', opts.buyerLeadId).maybeSingle()
    label = data?.full_name || 'buyer'
  } else if (opts.sellerLeadId) {
    const { data } = await svc.from('seller_leads').select('full_name, business_name').eq('id', opts.sellerLeadId).maybeSingle()
    label = data?.business_name || data?.full_name || 'seller'
  } else if (opts.dealId) {
    const { data } = await svc.from('deals').select('title').eq('id', opts.dealId).maybeSingle()
    label = data?.title || 'deal'
  }

  const dueAt = opts.dueAt || suggestNextCallTime()
  return createReminder({
    agency_id: agencyId,
    profile_id: opts.profileId || null,
    listing_id: opts.listingId || null,
    buyer_lead_id: opts.buyerLeadId || null,
    seller_lead_id: opts.sellerLeadId || null,
    deal_id: opts.dealId || null,
    title: opts.title || `Call back — ${label}`,
    notes: opts.notes || null,
    kind: opts.kind || 'call_back',
    due_at: dueAt,
  })
}


