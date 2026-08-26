/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { transitionListing } from '@/lib/publish'

export const runtime = 'nodejs'

/**
 * POST /api/listings/transition
 *   { listingId, status: 'active' | 'under_contract' | 'sold' | 'pending_sale' | 'withdrawn' }
 * Moves a listing through its lifecycle. On 'sold', auto-records the
 * platform success fee (tiered % of the sale price) — the money printer.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const listingId = String(body?.listingId || '')
  const status = String(body?.status || '')
  if (!listingId || !['active', 'under_contract', 'sold', 'pending_sale', 'withdrawn'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'listingId and a valid status are required' }, { status: 400 })
  }

  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, listing.agency_id)) return forbiddenResponse()

  const res = await transitionListing(listingId, status as any)
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
  return NextResponse.json({ ok: true, status, fee: res.fee || null })
}
