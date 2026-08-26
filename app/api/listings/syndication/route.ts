/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/listings/syndication — push a listing to marketplaces.
// GET  /api/listings/syndication?listingId= — current sync status per provider.
// PATCH /api/listings/syndication?id=&action=synced|removed — update a sync row.
// =============================================================================

const pushSchema = z.object({
  listingId: z.string().uuid(),
  providers: z.array(z.string()).min(1).max(10),
})

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })

  const { data, error } = await db
    .from('bbs_syncs')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, syncs: data || [] })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = auth.memberships[0]?.agency_id
  if (!agencyId) return forbiddenResponse('Not attached to an agency')

  const body = await req.json().catch(() => null)
  const parsed = pushSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed', detail: parsed.error.issues[0]?.message }, { status: 422 })
  }
  const { listingId, providers } = parsed.data

  // Agency gate: the caller must own this listing.
  const { data: listing, error: lErr } = await db
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .eq('agency_id', agencyId)
    .maybeSingle()
  if (lErr) return NextResponse.json({ ok: false, error: lErr.message }, { status: 500 })
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found in your agency' }, { status: 404 })

  // Build the payload once, insert a row per provider.
  const { buildSyncPayload } = await import('@/lib/syndicationEngine')
  const payload = buildSyncPayload(listing as Record<string, unknown>)

  const rows = providers.map((provider) => ({
    listing_id: listingId,
    provider,
    status: 'pending',
    payload_json: payload,
  }))
  const { data, error } = await db.from('bbs_syncs').insert(rows).select('*')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, syncs: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const id = req.nextUrl.searchParams.get('id')
  const action = req.nextUrl.searchParams.get('action')
  if (!id || !['synced', 'removed'].includes(action || '')) {
    return NextResponse.json({ ok: false, error: 'id and action (synced|removed) required' }, { status: 400 })
  }

  const { data: updated, error } = await db
    .from('bbs_syncs')
    .update({ status: action, last_sync_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ ok: false, error: 'Sync row not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
