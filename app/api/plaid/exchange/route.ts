/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/supabase/auth'
import { exchangePublicToken, fetchAccounts, saveVerifiedFinancial, setRevenueVerifiedFlag } from '@/lib/plaid'

export const runtime = 'nodejs'

/**
 * POST /api/plaid/exchange — exchange the Link public_token for an access
 * token, store it server-side in verified_financials, and flip the public
 * revenue_verified badge when the connection succeeds.
 * Body: { listingId, public_token }
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => null)
  const listingId = body?.listingId
  const publicToken = body?.public_token
  if (!listingId || !publicToken) {
    return NextResponse.json({ ok: false, error: 'listingId and public_token required' }, { status: 400 })
  }

  const agencyId = auth.memberships[0]?.agency_id
  if (!agencyId) return forbiddenResponse('Not attached to an agency')
  const { data: listing } = await db.from('listings').select('id').eq('id', listingId).eq('agency_id', agencyId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found in your agency' }, { status: 404 })

  // Exchange public token → access token.
  const exchanged = await exchangePublicToken(publicToken)
  if (!exchanged.ok) return NextResponse.json({ ok: false, error: exchanged.error || 'Exchange failed' }, { status: 500 })
  const accessToken = exchanged.access_token!

  // Pull account info to display + sanity-check.
  const accounts = await fetchAccounts(accessToken)
  const primary = accounts.ok ? (accounts.accounts?.[0] || null) : null

  const saved = await saveVerifiedFinancial({
    listing_id: listingId,
    agency_id: agencyId,
    plaid_item_id: exchanged.item_id || null,
    plaid_access_token: accessToken,
    institution_name: accounts.institution || null,
    account_mask: primary?.mask || null,
    status: 'connected',
  })
  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 500 })

  // Flip the public badge.
  await setRevenueVerifiedFlag(listingId, true)

  return NextResponse.json({
    ok: true,
    status: 'connected',
    institution: accounts.institution || null,
    account: primary ? { name: primary.name, mask: primary.mask, subtype: primary.subtype } : null,
  })
}
