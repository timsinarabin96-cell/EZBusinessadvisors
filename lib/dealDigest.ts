// =============================================================================
// Weekly Deal Digest
// -----------------------------------------------------------------------------
// A broker triggers a digest for their agency: we gather the week's active,
// seller-approved listings and email every opted-in recipient (buyer search
// profiles with notification_email=true plus active "notify me" subscriptions).
// One digest row is recorded per recipient for history. Never throws — a
// digest run degrades to a summary instead of exploding.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify } from './email'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export interface DigestListing {
  id: string
  business_name?: string | null
}

export interface DigestSummary {
  ok: boolean
  agencyId: string
  listings: number
  recipients: number
  sent: number
  error?: string
}

/** Active, seller-approved listings for an agency (approved review stage = seller approval ok). */
export async function fetchDigestListings(agencyId: string): Promise<DigestListing[]> {
  if (!svc) return []
  const { data, error } = await svc
    .from('listings')
    .select('id, business_name')
    .eq('agency_id', agencyId)
    .in('status', ['approved', 'published', 'active'])
    .eq('review_stage', 'approved')
  if (error) return []
  return (data || []) as DigestListing[]
}

/** Opted-in recipient emails: buyer search profiles + public notify subscriptions. */
export async function fetchDigestRecipients(agencyId: string): Promise<{ email: string; name: string | null }[]> {
  if (!svc) return []
  const seen = new Set<string>()
  const recipients: { email: string; name: string | null }[] = []

  const add = (email: string, name: string | null) => {
    const key = (email || '').trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    recipients.push({ email: key, name })
  }

  const [profiles, subscriptions] = await Promise.all([
    svc
      .from('buyer_search_profiles')
      .select('email, name')
      .eq('agency_id', agencyId)
      .eq('notification_email', true)
      .eq('active', true),
    svc
      .from('deal_notify_subscriptions')
      .select('email, name')
      .eq('agency_id', agencyId)
      .eq('active', true),
  ])

  for (const p of profiles.data || []) add(p.email, p.name)
  for (const s of subscriptions.data || []) add(s.email, s.name)
  return recipients
}

/**
 * Build and send the weekly digest for an agency: notify each recipient with
 * "<N> new businesses this week" and record a deal_digests row per recipient.
 * Never throws.
 */
export async function generateDigest(agencyId: string): Promise<DigestSummary> {
  if (!svc || !agencyId) return { ok: false, agencyId, listings: 0, recipients: 0, sent: 0, error: 'not configured' }

  const [listings, recipients] = await Promise.all([fetchDigestListings(agencyId), fetchDigestRecipients(agencyId)])
  const listingIds = listings.map((l) => l.id)
  let sent = 0

  for (const recipient of recipients) {
    await notify('deal_notification', recipient.email, {
      businessName: `${listings.length} new businesses this week`,
    })
    await svc.from('deal_digests').insert({
      agency_id: agencyId,
      recipient_email: recipient.email,
      listing_ids: listingIds,
      status: 'sent',
    })
    sent++
  }

  return { ok: true, agencyId, listings: listings.length, recipients: recipients.length, sent }
}

/** Safe wrapper — a digest run never throws to its caller. */
export async function generateDigestForAgency(agencyId: string): Promise<DigestSummary> {
  try {
    return await generateDigest(agencyId)
  } catch (error) {
    return {
      ok: false,
      agencyId,
      listings: 0,
      recipients: 0,
      sent: 0,
      error: error instanceof Error ? error.message : 'digest generation failed',
    }
  }
}
