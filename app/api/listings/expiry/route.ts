/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { setExpiry, renewListing, processExpirations, listExpirations } from '@/lib/listingExpiry'

export const runtime = 'nodejs'

/**
 * Listing Expiry & Renewal API
 * GET  /api/listings/expiry?agencyId=...&status=... — list records
 * POST /api/listings/expiry { action: 'set'|'renew'|'process', ... }
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const status = req.nextUrl.searchParams.get('status') || 'all'
  const records = await listExpirations(agencyId, status)
  return NextResponse.json({ ok: true, records })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  if (body.action === 'process') {
    if (!canManageAgency(auth, agencyId)) return forbiddenResponse()
    const result = await processExpirations(agencyId)
    return NextResponse.json({ ok: true, ...result })
  }

  if (body.action === 'set' || body.action === 'renew') {
    if (!body.listingId || !body.expiresAt) {
      return NextResponse.json({ ok: false, error: 'listingId and expiresAt are required' }, { status: 400 })
    }
    const { data: listing } = await db.from('listings').select('agency_id').eq('id', body.listingId).maybeSingle()
    if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
    if (listing.agency_id !== agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

    const result = body.action === 'renew' ? await renewListing(body.listingId, body.expiresAt) : await setExpiry(body.listingId, body.expiresAt)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'action must be set, renew, or process' }, { status: 400 })
}
