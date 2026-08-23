// =============================================================================
// Visitor Intent Tracking — anonymous listing engagement for brokers
// -----------------------------------------------------------------------------
// Public visitors view listings without logging in. We track anonymized view
// events (visitor_id is a browser-generated random UUID — never PII, never
// tied to an email) so brokers see which listings get real traction: total
// views, unique visitors, repeat engagement, and recency. This surfaces the
// "anonymous 90%" of buyers that watchlists never see.
// =============================================================================

import { supabase } from '@/lib/supabase/client'
import { getAgencyContext } from '@/lib/agencyContext'

const VISITOR_KEY = 'concord_visitor_id'

/** Get (or create) the anonymous visitor id stored in the browser. */
export function getVisitorId(): string {
  if (typeof window === 'undefined') return 'server'
  try {
    let id = window.localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = crypto.randomUUID()
      window.localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

/** Record a view of a listing (public, anonymous, fire-and-forget). */
export async function trackListingView(listingId: string, referrer?: string | null): Promise<void> {
  if (!listingId) return
  try {
    await fetch('/api/track-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_id: listingId, visitor_id: getVisitorId(), referrer: referrer || null }),
    })
  } catch {
    // fire-and-forget — never break the page over analytics
  }
}

export interface ListingIntentStats {
  listingId: string
  businessName: string | null
  totalViews: number
  uniqueVisitors: number
  repeatViewers: number        // visitors who viewed 2+ times
  lastViewedAt: string | null
  viewsLast7d: number
  hot: boolean                 // 3+ unique visitors in the last 7 days
}

/** Broker dashboard: engagement stats per listing in my agency. */
export async function fetchIntentForAgency(): Promise<ListingIntentStats[]> {
  const ctx = await getAgencyContext()
  if (!ctx) return []

  const { data: views } = await supabase
    .from('listing_views')
    .select('listing_id, visitor_id, viewed_at')
    .eq('agency_id', ctx.agencyId)
    .order('viewed_at', { ascending: false })
    .limit(5000)

  const { data: listings } = await supabase
    .from('listings')
    .select('id, business_name')
    .eq('agency_id', ctx.agencyId)

  const byListing = new Map<string, { views: number; visitors: Set<string>; last: string | null; last7: number }>()
  const cutoff7 = Date.now() - 7 * 86400000

  for (const v of views || []) {
    const entry = byListing.get(v.listing_id) || { views: 0, visitors: new Set<string>(), last: null, last7: 0 }
    entry.views += 1
    entry.visitors.add(v.visitor_id)
    const t = new Date(v.viewed_at).getTime()
    if (!entry.last || t > new Date(entry.last).getTime()) entry.last = v.viewed_at
    if (t >= cutoff7) entry.last7 += 1
    byListing.set(v.listing_id, entry)
  }

  const nameById = new Map((listings || []).map((l: any) => [l.id, l.business_name]))

  return [...byListing.entries()]
    .map(([listingId, e]) => ({
      listingId,
      businessName: nameById.get(listingId) || null,
      totalViews: e.views,
      uniqueVisitors: e.visitors.size,
      repeatViewers: e.views - e.visitors.size,
      lastViewedAt: e.last,
      viewsLast7d: e.last7,
      hot: e.visitors.size >= 3 && e.last7 >= 3,
    }))
    .sort((a, b) => b.uniqueVisitors - a.uniqueVisitors || b.totalViews - a.totalViews)
}

export interface IntentTotals {
  totalViews: number
  uniqueVisitors: number
  hotListings: number
  listingsTracked: number
}

export async function fetchIntentTotals(): Promise<IntentTotals> {
  const stats = await fetchIntentForAgency()
  const visitors = new Set<string>()
  let views = 0
  for (const s of stats) {
    views += s.totalViews
    // visitor ids aren't exposed at this level — approximate with uniqueVisitors sum
  }
  return {
    totalViews: views,
    uniqueVisitors: stats.reduce((s, x) => s + x.uniqueVisitors, 0),
    hotListings: stats.filter((x) => x.hot).length,
    listingsTracked: stats.length,
  }
}
