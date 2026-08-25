import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/seller-portal?token=*** — public, token-gated seller portal data.
// Sellers open their private link (/seller/<token>) and see: their lead
// status, the listing (if converted), live listing-view stats, NDA request
// count, and next steps. Token is the auth — no login needed (same pattern as
// the lender portal). Never returns financials or buyer PII.
// =============================================================================

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const token = req.nextUrl.searchParams.get('token') || ''
  if (!token || token.length < 12) {
    return NextResponse.json({ ok: false, error: 'Invalid link' }, { status: 400 })
  }

  // 1) Resolve the seller lead by portal token.
  const { data: lead } = await db
    .from('seller_leads')
    .select('id, business_name, industry, location_general, status, source, created_at, converted_listing_id')
    .eq('portal_token', token)
    .maybeSingle()
  if (!lead) {
    return NextResponse.json({ ok: false, error: 'Link not found or expired' }, { status: 404 })
  }

  // 2) Resolve the listing: converted lead link, or a listing carrying the token.
  let listing = null
  let listingId: string | null = (lead as { converted_listing_id?: string | null }).converted_listing_id || null
  if (!listingId) {
    const { data: byToken } = await db
      .from('listings')
      .select('id')
      .eq('portal_token', token)
      .maybeSingle()
    listingId = (byToken as { id?: string } | null)?.id || null
  }
  if (listingId) {
    const { data: l } = await db
      .from('listings')
      .select('id, listing_ref, business_name, industry, location_general, asking_price, status, published_at')
      .eq('id', listingId)
      .maybeSingle()
    if (l) {
      listing = {
        id: (l as { id: string }).id,
        listing_ref: (l as { listing_ref?: string | null }).listing_ref || null,
        business_name: (l as { business_name?: string | null }).business_name || null,
        industry: (l as { industry?: string | null }).industry || null,
        location_general: (l as { location_general?: string | null }).location_general || null,
        asking_price: (l as { asking_price?: number | null }).asking_price ?? null,
        status: (l as { status?: string | null }).status || null,
        published: Boolean((l as { published_at?: string | null }).published_at),
      }
    }
  }

  // 3) Live stats: listing views (7d + total) + NDA requests.
  let views7d = 0
  let viewsTotal = 0
  let ndaRequests = 0
  if (listingId) {
    const since = new Date(Date.now() - 7 * 86400000).toISOString()
    const [viewsRes, ndaRes] = await Promise.all([
      db.from('listing_views').select('id').eq('listing_id', listingId),
      db.from('data_room_access_requests').select('id').eq('listing_id', listingId),
    ])
    const views = (viewsRes.data || []) as { viewed_at?: string }[]
    viewsTotal = views.length
    views7d = views.filter((v) => v.viewed_at && v.viewed_at >= since).length
    ndaRequests = ((ndaRes.data || []) as unknown[]).length
  }

  // 4) Next steps — human-readable, stage-aware.
  const nextSteps: string[] = []
  if (!listing) {
    nextSteps.push('Your valuation request is being reviewed by a broker.')
    nextSteps.push('A broker will contact you within one business day to confirm details.')
    nextSteps.push('Once approved, your listing will be prepared confidentially.')
  } else if (!listing.published) {
    nextSteps.push('Your listing is being prepared — financials, valuation, and marketing documents.')
    nextSteps.push('You will be asked to approve the public preview before anything goes live.')
  } else {
    nextSteps.push('Your listing is live on the marketplace (confidential to qualified buyers).')
    if (viewsTotal > 0) nextSteps.push(`${viewsTotal} buyer view${viewsTotal === 1 ? '' : 's'} so far${views7d > 0 ? `, ${views7d} this week` : ''}.`)
    if (ndaRequests > 0) nextSteps.push(`${ndaRequests} buyer${ndaRequests === 1 ? '' : 's'} requested confidential access.`)
    nextSteps.push('Your broker will bring you qualified offers as they come in.')
  }

  return NextResponse.json({
    ok: true,
    lead: lead
      ? {
          id: (lead as { id: string }).id,
          business_name: (lead as { business_name?: string | null }).business_name || null,
          industry: (lead as { industry?: string | null }).industry || null,
          location_general: (lead as { location_general?: string | null }).location_general || null,
          status: (lead as { status?: string | null }).status || null,
          source: (lead as { source?: string | null }).source || null,
          created_at: (lead as { created_at?: string | null }).created_at || null,
        }
      : null,
    listing,
    stats: { views7d, viewsTotal, ndaRequests },
    nextSteps,
  })
}
