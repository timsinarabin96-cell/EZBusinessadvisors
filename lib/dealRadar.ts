// =============================================================================
// dealRadar — Deal Radar: automatic buyer-matching on listing publish.
// -----------------------------------------------------------------------------
// When a listing goes live, the radar:
//   1. Runs the buyer-matching engine (industry/location/price fit scores).
//   2. Picks the top N matches above a quality threshold.
//   3. Emails each matched buyer a confidential teaser (match-alert template).
//   4. Marks matches notified so brokers see "who was alerted" and buyers are
//      not re-spammed on every publish.
// Server-only. Never throws — publish must never break because of the radar.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify } from './email'
import { runMatchingForListing, type MatchResult } from './buyerMatching'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export const DEAL_RADAR_DEFAULTS = {
  /** Minimum match score to alert a buyer. */
  minScore: 65,
  /** Max buyers alerted per publish. */
  maxBuyers: 5,
}

export interface RadarResult {
  ok: boolean
  listingId: string
  matchesTotal: number
  alerted: number
  errors: string[]
}

/**
 * Fire the radar for a listing: match buyers, alert the top fits, and mark
 * notified. Returns a summary. Never throws.
 */
export async function fireDealRadar(
  listingId: string,
  opts?: { minScore?: number; maxBuyers?: number }
): Promise<RadarResult> {
  const result: RadarResult = { ok: true, listingId, matchesTotal: 0, alerted: 0, errors: [] }
  const minScore = opts?.minScore ?? DEAL_RADAR_DEFAULTS.minScore
  const maxBuyers = opts?.maxBuyers ?? DEAL_RADAR_DEFAULTS.maxBuyers
  if (!svc || !listingId) return { ...result, ok: false }

  try {
    // 1) Run the matching engine (records buyer_match_events with status pending).
    const matches: MatchResult[] = await runMatchingForListing(listingId)
    result.matchesTotal = matches.length

    // 2) Top matches above the quality threshold.
    const top = matches
      .filter((m) => m.match_score >= minScore)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, maxBuyers)

    if (top.length === 0) return result

    // 3) Load listing teaser + buyer contact info.
    const { data: listing } = await svc
      .from('listings')
      .select('id, business_name, industry, location_general, asking_price, headline, public_summary')
      .eq('id', listingId)
      .maybeSingle()
    const ids = top.map((m) => m.buyer_profile_id)
    const { data: buyers } = await svc
      .from('buyer_search_profiles')
      .select('id, email, name, notification_email')
      .in('id', ids)

    const buyerById = new Map((buyers || []).map((b) => [b.id, b]))
    const listingUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'}/marketplace/listings/${listingId}`

    // 4) Alert each opted-in buyer + mark notified.
    for (const m of top) {
      const buyer = buyerById.get(m.buyer_profile_id)
      if (!buyer?.email || buyer.notification_email === false) {
        // Still record as notified (email disabled) so it isn't retried.
        await markNotified(m, 'email_disabled')
        continue
      }
      try {
        await notify('match_alert', buyer.email, {
          name: buyer.name || 'there',
          businessName: (listing as { business_name?: string | null } | null)?.business_name || 'a new listing',
          price: (listing as { asking_price?: number | null } | null)?.asking_price ?? null,
          score: m.match_score,
          listingId,
        })
        await markNotified(m, 'email')
        result.alerted += 1
      } catch (e) {
        result.errors.push((e as Error)?.message || 'email failed')
      }
    }
  } catch (e) {
    result.ok = false
    result.errors.push((e as Error)?.message || 'radar failed')
  }
  return result
}

/** Mark a buyer_match_event as notified so it's never re-alerted. */
async function markNotified(m: MatchResult, channel: string): Promise<void> {
  if (!svc) return
  try {
    await svc
      .from('buyer_match_events')
      .update({ status: 'notified', notified_at: new Date().toISOString(), notification_channel: channel })
      .eq('buyer_profile_id', m.buyer_profile_id)
      .eq('listing_id', m.listing_id)
  } catch {
    /* best-effort */
  }
}
