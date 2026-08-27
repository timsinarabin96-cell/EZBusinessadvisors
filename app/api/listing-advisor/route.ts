/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { runListingAdvisor } from '@/lib/listingAdvisor'

export const runtime = 'nodejs'

/**
 * POST /api/listing-advisor — run the Listing Advisor for a listing.
 * Body: { listingId }
 * Returns the advisor report: questions to ask the seller, valuation range,
 * listability verdict, and the CIM prep checklist.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }
  const listingId = String(body?.listingId || '')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  // Agency gate — same as every other listing-scoped route.
  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, listing.agency_id)) return forbiddenResponse()

  const report = await runListingAdvisor(listingId)
  if (!('ok' in report)) return NextResponse.json({ ok: true, report })
  return NextResponse.json({ ok: false, error: report.error }, { status: 500 })
}
