/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/supabase/auth'
import { createLinkToken, plaidConfigured } from '@/lib/plaid'

export const runtime = 'nodejs'

/**
 * POST /api/plaid/link-token — create a Plaid Link token for the signed-in
 * broker (used from the dashboard to connect a seller's bank account).
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  if (!plaidConfigured) return NextResponse.json({ ok: false, error: 'Plaid is not configured' }, { status: 503 })

  const body = await req.json().catch(() => null)
  const listingId = body?.listingId
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })

  // Verify the listing belongs to the caller's agency.
  const agencyId = auth.memberships[0]?.agency_id
  if (!agencyId) return forbiddenResponse('Not attached to an agency')
  const { data: listing } = await db.from('listings').select('id').eq('id', listingId).eq('agency_id', agencyId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found in your agency' }, { status: 404 })

  const result = await createLinkToken(auth.user.id)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, link_token: result.link_token })
}
