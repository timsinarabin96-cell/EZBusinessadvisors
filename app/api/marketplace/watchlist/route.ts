/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * /api/marketplace/watchlist
 *
 * GET  — list the caller's saved searches, bookmarks, and recent match alerts
 * POST — create a saved search ({ name, criteria, notify_email }) or bookmark
 *        a listing ({ bookmark: listingId })
 * PATCH — update a search ({ searchId, name?, criteria?, notify_email?, active? })
 * DELETE — remove a search ({ searchId }) or bookmark ({ bookmarkId })
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const email = auth.user.email || ''
  const { data: buyerProfile } = await db
    .from('buyer_search_profiles')
    .select('id, agency_id')
    .eq('email', email)
    .maybeSingle()

  if (!buyerProfile) {
    return NextResponse.json({ ok: true, agencyId: auth.memberships[0]?.agency_id || null, searches: [], bookmarks: [], alerts: [] })
  }

  const [searches, bookmarks, alerts] = await Promise.all([
    db.from('buyer_watchlist_searches').select('*').eq('buyer_profile_id', buyerProfile.id).order('created_at', { ascending: false }),
    db
      .from('buyer_bookmarked_listings')
      .select('*, listings(id, business_name, asking_price, industry, location_general, status)')
      .eq('buyer_profile_id', buyerProfile.id)
      .order('created_at', { ascending: false }),
    db
      .from('buyer_match_events')
      .select('*, listings(id, business_name, asking_price, industry, location_general)')
      .eq('buyer_profile_id', buyerProfile.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return NextResponse.json({
    ok: true,
    agencyId: buyerProfile.agency_id,
    searches: searches.data || [],
    bookmarks: bookmarks.data || [],
    alerts: alerts.data || [],
  })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const email = auth.user.email || ''
  const { data: buyerProfile } = await db
    .from('buyer_search_profiles')
    .select('id, agency_id')
    .eq('email', email)
    .maybeSingle()

  if (!buyerProfile) {
    return NextResponse.json({ ok: false, error: 'No buyer profile linked to this account yet' }, { status: 400 })
  }

  // Bookmark a listing.
  if (body.bookmark) {
    const { data, error } = await db
      .from('buyer_bookmarked_listings')
      .upsert(
        {
          agency_id: buyerProfile.agency_id,
          buyer_profile_id: buyerProfile.id,
          listing_id: body.bookmark,
        },
        { onConflict: 'buyer_profile_id,listing_id' },
      )
      .select()
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, bookmark: data })
  }

  // Create a saved search.
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 })
  }
  const { data, error } = await db
    .from('buyer_watchlist_searches')
    .insert({
      agency_id: buyerProfile.agency_id,
      buyer_profile_id: buyerProfile.id,
      name: body.name,
      criteria: body.criteria || {},
      notify_email: body.notify_email !== false,
      active: true,
    })
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, search: data })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (!body.searchId) {
    return NextResponse.json({ ok: false, error: 'searchId is required' }, { status: 400 })
  }
  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') patch.name = body.name
  if (body.criteria && typeof body.criteria === 'object') patch.criteria = body.criteria
  if (typeof body.notify_email === 'boolean') patch.notify_email = body.notify_email
  if (typeof body.active === 'boolean') patch.active = body.active
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'nothing to update' }, { status: 400 })
  }
  const { data, error } = await db
    .from('buyer_watchlist_searches')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', body.searchId)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, search: data })
}

export async function DELETE(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (body.searchId) {
    const { error } = await db.from('buyer_watchlist_searches').delete().eq('id', body.searchId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (body.bookmarkId) {
    const { error } = await db.from('buyer_bookmarked_listings').delete().eq('id', body.bookmarkId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ ok: false, error: 'searchId or bookmarkId required' }, { status: 400 })
}
