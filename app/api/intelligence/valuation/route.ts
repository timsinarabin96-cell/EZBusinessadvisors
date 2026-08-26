/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { estimateValuation, listValuations } from '@/lib/valuation'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f-]{36}$/i

/**
 * /api/intelligence/valuation
 *
 * GET  ?agencyId=...&listingId=...  — list valuation estimates (all for the
 *      agency, or filtered to one listing)
 * POST { listingId }                — run the valuation engine for a listing
 *      and persist the estimate
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || ''
  const listingId = req.nextUrl.searchParams.get('listingId') || undefined
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const estimates = await listValuations(agencyId, listingId)
  return NextResponse.json({ ok: true, estimates })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = (await req.json().catch(() => null)) as { listingId?: string } | null
  const listingId = body?.listingId || ''
  if (!listingId || !UUID_RE.test(listingId)) {
    return NextResponse.json({ ok: false, error: 'A valid listingId is required' }, { status: 400 })
  }

  // Verify the caller manages the agency that owns the listing.
  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(authenticated, listing.agency_id)) return forbiddenResponse()

  const result = await estimateValuation(listingId)
  if (!result.ok || !result.estimate) {
    return NextResponse.json({ ok: false, error: result.error || 'Valuation failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, estimate: result.estimate })
}
