/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Public "Notify Me" Subscriptions
// -----------------------------------------------------------------------------
// Anonymous visitors leave an email + criteria on a public marketplace page
// ("notify me when a matching business goes live"). Inserts run through the
// service-role client (RLS keeps the table agency-scoped for reads); the
// matcher fires a deal_notification email the moment a qualifying listing
// appears. Never throws — capture and alerting degrade gracefully.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify } from './email'
import { createReminder } from './reminders'

// Service-role client for public capture. The key is server-only; this module
// is never imported by client components.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'
// EZ Business Advisors — default tenant for the public marketplace (matches
// the agency seed in sql/core_agency_isolation.sql).
const DEFAULT_AGENCY_ID = '354facdb-cce2-4eb0-a160-8454854e731a'
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export interface NotifyCriteria {
  industries?: string[]
  max_price?: number | null
  min_sde?: number | null
}

export interface NotifySubscription {
  id: string
  agency_id: string | null
  email: string
  name: string | null
  criteria: NotifyCriteria
  active: boolean
  created_at: string
}

export interface ListingForNotify {
  id: string
  agency_id: string
  business_name?: string | null
  industry: string | null
  sub_industry: string | null
  asking_price: number | null
  sde: number | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const norm = (s: string | null | undefined) => (s || '').toLowerCase().trim()

function industriesOverlap(criteria: NotifyCriteria, listing: ListingForNotify): boolean {
  const wanted = (criteria.industries || []).map(norm).filter(Boolean)
  if (wanted.length === 0) return true // no industry requirement -> matches
  const listingInds = [listing.industry, listing.sub_industry].map(norm).filter(Boolean)
  if (listingInds.length === 0) return false
  const set = new Set(wanted)
  return listingInds.some((ind) => set.has(ind))
}

/** True when a subscription's criteria accepts the listing. */
export function matchesNotifyCriteria(criteria: NotifyCriteria, listing: ListingForNotify): boolean {
  if (!industriesOverlap(criteria, listing)) return false
  if (criteria.max_price != null && listing.asking_price != null && listing.asking_price > criteria.max_price) return false
  if (criteria.min_sde != null && listing.sde != null && listing.sde < criteria.min_sde) return false
  return true
}

/** Insert a public "notify me" subscription via the service-role client. */
export async function subscribe(input: {
  email: string
  name?: string | null
  criteria?: NotifyCriteria
  agencyId?: string | null
}): Promise<{ ok: boolean; error?: string; data?: NotifySubscription }> {
  const email = (input.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'A valid email is required' }
  if (!svc) return { ok: false, error: 'not configured' }

  const { data, error } = await svc
    .from('deal_notify_subscriptions')
    .insert({
      agency_id: input.agencyId || null,
      email,
      name: input.name?.trim() || null,
      criteria: input.criteria && typeof input.criteria === 'object' ? input.criteria : {},
      active: true,
    })
    .select()
    .maybeSingle()
  if (error) return { ok: false, error: error.message }

  // Lead connection (best-effort, never throws): invitation email with a
  // calendar-booking link + a broker follow-up reminder in the CRM.
  await connectLead(data as NotifySubscription)

  return { ok: true, data: data as NotifySubscription }
}

/**
 * Connect a freshly captured buyer: send the invitation email (with the
 * public booking link) and drop a follow-up reminder for the broker. Fails
 * silent — capture and alerting must never break on the connection flow.
 */
async function connectLead(sub: NotifySubscription): Promise<void> {
  try {
    const criteria = sub.criteria || {}
    const industries = Array.isArray(criteria.industries) ? criteria.industries : []
    await notify('buyer_invite', sub.email, {
      name: sub.name || null,
      industries,
      maxPrice: criteria.max_price ?? null,
      bookingUrl: `${APP_URL}/book`,
    })

    const agencyId = sub.agency_id || DEFAULT_AGENCY_ID
    const dueAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    await createReminder({
      agency_id: agencyId,
      title: `Follow up — new buyer lead${sub.name ? ` (${sub.name})` : ''}`,
      notes: `${sub.email} · looking for ${industries.join(', ') || 'a business'}${criteria.max_price ? ` · up to $${Number(criteria.max_price).toLocaleString()}` : ''}`,
      kind: 'follow_up',
      due_at: dueAt,
    })
  } catch (e) {
    console.log(`[notify] lead connection skipped: ${(e as Error)?.message}`)
  }
}

/** Fetch active subscriptions for an agency (service-role read). */
export async function fetchActiveSubscriptions(agencyId: string): Promise<NotifySubscription[]> {
  if (!svc) return []
  const { data, error } = await svc
    .from('deal_notify_subscriptions')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('active', true)
  if (error) return []
  return (data || []) as NotifySubscription[]
}

/**
 * Fire deal notifications to every active subscription whose criteria matches
 * the listing (industry overlap, max_price, min_sde). Never throws — a failed
 * notify or query only skips that subscriber.
 */
export async function matchPublicSubscriptions(listing: ListingForNotify): Promise<{ checked: number; matched: number }> {
  if (!svc || !listing?.agency_id) return { checked: 0, matched: 0 }
  const subscriptions = await fetchActiveSubscriptions(listing.agency_id)
  let matched = 0

  for (const sub of subscriptions) {
    if (!matchesNotifyCriteria(sub.criteria || {}, listing)) continue
    await notify('deal_notification', sub.email, {
      businessName: listing.business_name || 'a new business',
      price: listing.asking_price,
    })
    matched++
  }

  return { checked: subscriptions.length, matched }
}
