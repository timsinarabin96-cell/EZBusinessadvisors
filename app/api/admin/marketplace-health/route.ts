/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/admin/marketplace-health — marketplace liquidity dashboard (admin).
// The funnel that matters for liquidity: listings → views → NDAs → leads.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 365)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const [{ data: live }, { data: totalListings }, { data: views }, { data: ndas }, { data: buyerLeads }, { data: sellerLeads }, { data: recentViews }, { data: topListings }, { data: recentNdas }] = await Promise.all([
    db.from('public_listings').select('id').eq('published', true),
    db.from('listings').select('id'),
    db.from('listing_views').select('id').gte('viewed_at', since),
    db.from('nda_requests').select('id, status, created_at').gte('created_at', since),
    db.from('buyer_leads').select('id, created_at').gte('created_at', since),
    db.from('seller_leads').select('id, created_at').gte('created_at', since),
    db.from('listing_views').select('viewed_at, visitor_id').gte('viewed_at', since).order('viewed_at', { ascending: false }).limit(500),
    db.from('public_listings').select('listing_id, public_title, is_featured').eq('published', true).order('is_featured', { ascending: false }).limit(10),
    db.from('nda_requests').select('id, status, created_at, listing_id').gte('created_at', since).order('created_at', { ascending: false }).limit(25),
  ])

  const uniqueVisitors = new Set((recentViews || []).map((v: any) => v.visitor_id)).size
  const ndaSigned = (ndas || []).filter((n: any) => n.status === 'signed').length
  const ndaApproved = (ndas || []).filter((n: any) => n.status === 'approved').length

  // Weekly view trend (last 8 weeks)
  const trend: { week: string; views: number }[] = []
  for (let w = 7; w >= 0; w--) {
    const start = new Date(Date.now() - (w + 1) * 7 * 86400000).toISOString()
    const end = new Date(Date.now() - w * 7 * 86400000).toISOString()
    const count = (recentViews || []).filter((v: any) => v.viewed_at >= start && v.viewed_at < end).length
    const label = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    trend.push({ week: label, views: count })
  }

  return NextResponse.json({
    ok: true,
    days,
    funnel: {
      liveListings: (live || []).length,
      totalListings: (totalListings || []).length,
      views: (views || []).length,
      uniqueVisitors,
      ndaRequests: (ndas || []).length,
      ndaSigned,
      ndaApproved,
      buyerLeads: (buyerLeads || []).length,
      sellerLeads: (sellerLeads || []).length,
    },
    trend,
    topListings: (topListings || []).map((l: any) => ({ listing_id: l.listing_id, public_title: l.public_title, is_featured: l.is_featured })),
    recentNdas: (recentNdas || []).map((n: any) => ({ id: n.id, status: n.status, created_at: n.created_at, listing_id: n.listing_id })),
  })
}
