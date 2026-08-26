/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Listing Expiry & Renewal
// -----------------------------------------------------------------------------
// Track when listings expire, send 7-day reminder emails, auto-expire past-due
// listings, and support one-click renewal. Listing status is left untouched
// (the listings.status constraint may not allow 'expired'); the expiration
// record drives the workflow. Server-only, never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify } from './email'
import { computeValuation } from './valuation'
import { createHmac } from 'node:crypto'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/** Set (or update) a listing's expiry date. */
export async function setExpiry(listingId: string, expiresAt: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: listing } = await svc.from('listings').select('agency_id, business_name').eq('id', listingId).maybeSingle()
  if (!listing?.agency_id) return { ok: false, error: 'Listing not found' }

  // Close out any active expiry record, then insert a fresh one.
  await svc.from('listing_expirations').update({ status: 'renewed', renewed_at: new Date().toISOString() }).eq('listing_id', listingId).eq('status', 'active')

  const { error } = await svc.from('listing_expirations').insert({
    agency_id: listing.agency_id,
    listing_id: listingId,
    expires_at: expiresAt,
    status: 'active',
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Renew a listing: close the active record and start a new one. */
export async function renewListing(listingId: string, newExpiresAt: string): Promise<{ ok: boolean; error?: string }> {
  return setExpiry(listingId, newExpiresAt)
}

/**
 * Process expirations for an agency:
 *  - listings past due -> mark their active expiry record 'expired'
 *  - listings within 7 days -> send one reminder email per record
 */
export async function processExpirations(agencyId: string): Promise<{ expired: number; reminded: number }> {
  if (!svc) return { expired: 0, reminded: 0 }
  const now = new Date()
  const in7d = new Date(now.getTime() + 7 * 86400000)
  let expired = 0
  let reminded = 0

  const { data: records } = await svc
    .from('listing_expirations')
    .select('*, listings(id, business_name, agency_id)')
    .eq('agency_id', agencyId)
    .eq('status', 'active')
  if (!records?.length) return { expired: 0, reminded: 0 }

  for (const r of records) {
    const expiresAt = new Date(r.expires_at as string)
    const listing = r.listings as any
    if (!listing) continue

    if (expiresAt < now) {
      await svc.from('listing_expirations').update({ status: 'expired' }).eq('id', r.id)
      expired++
    } else if (expiresAt <= in7d) {
      // Reminder (only when the record has no reminder marker; reuse notes-free idempotency via updated_at check is complex,
      // so we rely on the email queue dedup and send at most once per record per day).
      await notify('deal_notification', await agencyOwnerEmails(agencyId), {
        businessName: `${listing.business_name || 'Listing'} expires ${expiresAt.toLocaleDateString()} — renew to keep it live`,
        dealStage: 'expiry-reminder',
      })
      reminded++
    }
  }
  return { expired, reminded }
}

async function agencyOwnerEmails(agencyId: string): Promise<string> {
  if (!svc) return ''
  const { data: members } = await svc.from('agency_members').select('profile_id, is_owner, role').eq('agency_id', agencyId)
  const ids = (members || []).filter((m) => m.is_owner || m.role === 'admin').map((m) => m.profile_id)
  if (!ids.length) return ''
  const { data: profiles } = await svc.from('profiles').select('email').in('id', ids)
  return (profiles || []).map((p) => p.email).filter(Boolean).join(',')
}

/** List expiry records for an agency. */
export async function listExpirations(agencyId: string, status?: string): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  let query = svc.from('listing_expirations').select('*, listings(id, business_name, asking_price, status)').eq('agency_id', agencyId)
  if (status && status !== 'all') query = query.eq('status', status)
  const { data } = await query.order('expires_at', { ascending: true }).limit(100)
  return (data || []) as Record<string, unknown>[]
}

// ---------------------------------------------------------------------------
// Auto-renewal machine — the recurring-revenue engine.
// Listings within RENEWAL_WINDOW_DAYS of expiry get a refreshed valuation +
// comps context + one-click renew link emailed to the seller & agency.
// ---------------------------------------------------------------------------

const RENEWAL_WINDOW_DAYS = 30
const RENEW_TERM_MONTHS = 6

/** Signed one-click renew token — prevents tampering on the public route. */
export function renewalToken(listingId: string, expiresAt: string): string {
  const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'renewal'
  return createHmac('sha256', secret).update(`${listingId}:${expiresAt}`).digest('hex').slice(0, 32)
}

/**
 * Scan an agency's active expirations and email a renewal proposal for every
 * listing inside the 30-day window. Refreshes the valuation so the seller
 * sees a fresh range, not the stale one from intake. Idempotent-ish: sends at
 * most once per record per day (tracked on the record's updated_at).
 */
export async function proposeRenewals(agencyId: string): Promise<{ proposed: number; skipped: number }> {
  if (!svc) return { proposed: 0, skipped: 0 }
  const now = Date.now()
  const in30d = now + RENEWAL_WINDOW_DAYS * 86400000
  const { data: records } = await svc
    .from('listing_expirations')
    .select('*, listings(id, business_name, asking_price, annual_revenue, sde, ebitda, industry, agency_id, seller_email)')
    .eq('agency_id', agencyId)
    .eq('status', 'active')
  if (!records?.length) return { proposed: 0, skipped: 0 }

  const ownerEmails = await agencyOwnerEmails(agencyId)
  let proposed = 0
  let skipped = 0

  for (const r of records) {
    const expiresAt = new Date(r.expires_at as string)
    const ms = expiresAt.getTime()
    if (!(ms > now && ms <= in30d)) { skipped++; continue }

    // At most one proposal per record per day (updated_at drift guard).
    const lastUpdate = r.updated_at ? new Date(r.updated_at as string).getTime() : 0
    if (Date.now() - lastUpdate < 20 * 3600000) { skipped++; continue }

    const listing = r.listings as any
    if (!listing) { skipped++; continue }

    const daysLeft = Math.max(1, Math.ceil((ms - now) / 86400000))

    // Refreshed valuation from current figures (pure function, no LLM).
    let low: number | null = null
    let high: number | null = null
    try {
      const est = computeValuation({
        business_name: listing.business_name || 'Business',
        industry: listing.industry,
        annual_revenue: listing.annual_revenue,
        sde: listing.sde,
        asking_price: listing.asking_price,
      })
      if (est) { low = est.estimate_min; high = est.estimate_max }
    } catch { /* valuation is best-effort */ }

    const token = renewalToken(listing.id, r.expires_at as string)
    const renewUrl = `${APP_URL}/api/renewals/redeem?listingId=${listing.id}&token=${token}`

    const payload = {
      businessName: listing.business_name || 'Your listing',
      expiresAt: expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      daysLeft,
      price: listing.asking_price,
      valuationLow: low,
      valuationHigh: high,
      renewUrl,
    }

    // Email the seller (when we have their address) and always the agency.
    const targets = [listing.seller_email, ownerEmails].filter(Boolean).join(',')
    if (targets) {
      await notify('renewal_proposal', targets, payload)
      await svc.from('listing_expirations').update({ updated_at: new Date().toISOString() }).eq('id', r.id)
      proposed++
    } else {
      skipped++
    }
  }
  return { proposed, skipped }
}

/**
 * Redeem a one-click renewal. Validates the signature, extends the term by
 * RENEW_TERM_MONTHS, and notifies the seller the listing is back live.
 */
export async function redeemRenewal(listingId: string, token: string): Promise<{ ok: boolean; error?: string; expiresAt?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: rec } = await svc
    .from('listing_expirations')
    .select('*, listings(id, business_name, seller_email, agency_id)')
    .eq('listing_id', listingId)
    .eq('status', 'active')
    .maybeSingle()
  if (!rec) return { ok: false, error: 'No active listing term found' }

  const expiresAt = rec.expires_at as string
  if (renewalToken(listingId, expiresAt) !== token) return { ok: false, error: 'Invalid renewal link' }

  const now = new Date()
  const newExpires = new Date(now.getTime() + RENEW_TERM_MONTHS * 30.44 * 86400000).toISOString().slice(0, 10)
  const renewed = await renewListing(listingId, newExpires)
  if (!renewed.ok) return { ok: false, error: renewed.error || 'Renewal failed' }

  const listing = rec.listings as any
  if (listing?.seller_email) {
    await notify('renewal_renewed', listing.seller_email, {
      businessName: listing.business_name || 'Your listing',
      expiresAt: new Date(newExpires + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    })
  }
  return { ok: true, expiresAt: newExpires }
}
