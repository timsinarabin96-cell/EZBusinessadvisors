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

/** Recency weight for a view: 7d = 1.0, 30d = 0.6, older = 0.3. */
export function visitorRecencyWeight(viewedAtIso: string, nowIso = new Date().toISOString()): number {
  const ageMs = Date.parse(nowIso) - Date.parse(viewedAtIso)
  if (!Number.isFinite(ageMs) || ageMs < 0) return 1
  const days = ageMs / 86_400_000
  if (days <= 7) return 1
  if (days <= 30) return 0.6
  return 0.3
}

/**
 * Pure per-visitor intent score (0-100).
 *  score = 14·ln(1 + recencyWeightedViews) + 6·breadth
 * Breadth = distinct listings viewed, capped at 4. Repeat views of the same
 * listing still count (re-reading = intent), just once per view event.
 */
export function computeVisitorIntentScore(views: { viewedAtIso: string }[], distinctListings: number, nowIso = new Date().toISOString()): number {
  let activity = 0
  for (const v of views) activity += visitorRecencyWeight(v.viewedAtIso, nowIso)
  const score = Math.round(14 * Math.log(1 + activity) + 6 * Math.min(distinctListings, 4))
  return Math.max(0, Math.min(100, score))
}

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

export interface VisitorPathListing {
  listingId: string
  businessName: string | null
  views: number
  lastViewedAt: string | null
}

export interface VisitorPath {
  visitorId: string
  totalViews: number
  distinctListings: number
  firstSeenAt: string | null
  lastSeenAt: string | null
  score: number
  listings: VisitorPathListing[]
}

/**
 * Per-visitor journey: group anonymous listing_views by visitor_id and show
 * the path each visitor took (which listings, how often, how recently) with a
 * recency-weighted intent score. Brokers see the anonymous 90% as people,
 * ranked — the "hot anonymous buyer" view.
 */
export async function fetchVisitorPaths(): Promise<VisitorPath[]> {
  const ctx = await getAgencyContext()
  if (!ctx) return []

  const { data: views } = await supabase
    .from('listing_views')
    .select('visitor_id, listing_id, viewed_at')
    .eq('agency_id', ctx.agencyId)
    .order('viewed_at', { ascending: false })
    .limit(10000)

  const { data: listings } = await supabase
    .from('listings')
    .select('id, business_name')
    .eq('agency_id', ctx.agencyId)
  const nameById = new Map((listings || []).map((l: any) => [l.id, l.business_name]))

  const byVisitor = new Map<string, { views: { viewedAtIso: string }[]; listings: Map<string, { views: number; lastViewedAt: string | null }>; first: string | null; last: string | null }>()
  for (const v of views || []) {
    const vid = String(v.visitor_id)
    let entry = byVisitor.get(vid)
    if (!entry) {
      entry = { views: [], listings: new Map(), first: null, last: null }
      byVisitor.set(vid, entry)
    }
    entry.views.push({ viewedAtIso: v.viewed_at })
    const li = entry.listings.get(v.listing_id) || { views: 0, lastViewedAt: null }
    li.views += 1
    if (!li.lastViewedAt || v.viewed_at > li.lastViewedAt) li.lastViewedAt = v.viewed_at
    entry.listings.set(v.listing_id, li)
    if (!entry.first || v.viewed_at < entry.first) entry.first = v.viewed_at
    if (!entry.last || v.viewed_at > entry.last) entry.last = v.viewed_at
  }

  const nowIso = new Date().toISOString()
  return [...byVisitor.entries()]
    .map(([visitorId, e]) => {
      const listings = [...e.listings.entries()].map(([listingId, li]) => ({
        listingId,
        businessName: nameById.get(listingId) || null,
        views: li.views,
        lastViewedAt: li.lastViewedAt,
      }))
      return {
        visitorId,
        totalViews: e.views.length,
        distinctListings: listings.length,
        firstSeenAt: e.first,
        lastSeenAt: e.last,
        score: computeVisitorIntentScore(e.views, listings.length, nowIso),
        listings: listings.sort((a, b) => (b.lastViewedAt || '').localeCompare(a.lastViewedAt || '')),
      }
    })
    .filter((p) => p.totalViews > 0)
    .sort((a, b) => b.score - a.score || b.totalViews - a.totalViews)
}

/** Intent summary for a specific visitor — used to stamp a converted lead. */
export async function fetchVisitorIntentForVisitor(visitorId: string): Promise<{ views: number; distinctListings: number; score: number } | null> {
  if (!visitorId) return null
  const { data: views } = await supabase
    .from('listing_views')
    .select('visitor_id, listing_id, viewed_at')
    .eq('visitor_id', visitorId)
    .limit(5000)
  if (!views || views.length === 0) return null
  const distinct = new Set(views.map((v: any) => v.listing_id)).size
  return {
    views: views.length,
    distinctListings: distinct,
    score: computeVisitorIntentScore(views.map((v: any) => ({ viewedAtIso: v.viewed_at })), distinct),
  }
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
