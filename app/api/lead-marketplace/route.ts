/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { browseMarketplace, myMarketListings, myPurchases, publishLead, withdrawListing, purchaseLead } from '@/lib/leadMarketplace'

export const runtime = 'nodejs'

/**
 * /api/lead-marketplace — cross-agency lead buying/selling.
 *
 * GET  ?view=browse|mine|purchases&agencyId=... — browse listed leads, my
 *      listings, or my purchases.
 * POST { action: 'publish', agencyId, leadId, industry?, location?, budget?,
 *        funds?, headline?, priceCents } — list a buyer lead for sale.
 * POST { action: 'withdraw', listingId, agencyId }
 * POST { action: 'buy', listingId, agencyId } — purchase (demo mode: instant).
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const view = req.nextUrl.searchParams.get('view') || 'browse'

  if (view === 'browse') {
    const leads = await browseMarketplace()
    return NextResponse.json({ ok: true, leads })
  }

  const agencyId = req.nextUrl.searchParams.get('agencyId') || ''
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  if (view === 'mine') {
    const listings = await myMarketListings(agencyId)
    return NextResponse.json({ ok: true, listings })
  }
  if (view === 'purchases') {
    const purchases = await myPurchases(agencyId)
    return NextResponse.json({ ok: true, purchases })
  }

  return NextResponse.json({ ok: false, error: 'view must be browse, mine, or purchases' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || '')
  const agencyId = String(body?.agencyId || '').trim()
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  if (action === 'publish') {
    const result = await publishLead({
      agencyId,
      leadId: String(body?.leadId || '').trim(),
      industry: body?.industry ? String(body.industry) : null,
      location: body?.location ? String(body.location) : null,
      budget: body?.budget ? String(body.budget) : null,
      funds: body?.funds ? String(body.funds) : null,
      headline: body?.headline ? String(body.headline) : undefined,
      tier: body?.tier as 'standard' | 'premium' | 'elite' | undefined,
      priceCents: Number(body?.priceCents) || 0,
    })
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, listing: result.listing }, { status: 201 })
  }

  if (action === 'withdraw') {
    const result = await withdrawListing(String(body?.listingId || ''), agencyId)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'buy') {
    const result = await purchaseLead(String(body?.listingId || ''), agencyId)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, lead: result.lead })
  }

  return NextResponse.json({ ok: false, error: 'action must be publish, withdraw, or buy' }, { status: 400 })
}
