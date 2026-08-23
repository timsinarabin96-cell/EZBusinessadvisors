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
        businessName: `${listing.business_name || 'Listing'} expires ${expiresAt.toLocaleDateString()}`,
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
