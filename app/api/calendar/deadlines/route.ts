/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * GET /api/calendar/deadlines?agencyId=...
 * Auto-deadlines for the Deal Time view — sourced from deal state:
 *   • listing_expirations  (active listing expiry dates)
 *   • nda_requests         (sent NDAs with nda_expires_at)
 *   • public_listings      (seller approval windows: approval_expires_at)
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const now = new Date().toISOString()
  const deadlines: Record<string, unknown>[] = []

  // 1) Listing expirations (active).
  const { data: expiries } = await db
    .from('listing_expirations')
    .select('id, listing_id, expires_at, status, listings(id, business_name, listing_ref)')
    .eq('agency_id', agencyId)
    .eq('status', 'active')
    .gte('expires_at', now)
    .order('expires_at', { ascending: true })
    .limit(50)
  for (const e of expiries || []) {
    deadlines.push({
      id: `exp-${e.id}`,
      source: 'listing_expiry',
      title: 'Listing expires',
      due_at: e.expires_at,
      entity: (e.listings as any)?.business_name || 'Listing',
      listing_ref: (e.listings as any)?.listing_ref || null,
      icon: '⏳',
    })
  }

  // 2) Sent NDAs with an expiry date.
  const { data: ndas } = await db
    .from('nda_requests')
    .select('id, listing_id, nda_expires_at, status, listings(id, business_name, listing_ref)')
    .not('nda_expires_at', 'is', null)
    .gte('nda_expires_at', now)
    .order('nda_expires_at', { ascending: true })
    .limit(50)
  for (const n of ndas || []) {
    deadlines.push({
      id: `nda-${n.id}`,
      source: 'nda_expiry',
      title: 'NDA expires',
      due_at: n.nda_expires_at,
      entity: (n.listings as any)?.business_name || 'NDA',
      listing_ref: (n.listings as any)?.listing_ref || null,
      icon: '🛡️',
    })
  }

  // 3) Seller approval windows (public_listings → listings).
  const { data: approvals } = await db
    .from('public_listings')
    .select('listing_id, approval_expires_at, listings(id, agency_id, business_name, listing_ref)')
    .not('approval_expires_at', 'is', null)
    .gte('approval_expires_at', now)
    .order('approval_expires_at', { ascending: true })
    .limit(50)
  for (const a of approvals || []) {
    const listing = a.listings as any
    if (!listing || listing.agency_id !== agencyId) continue
    deadlines.push({
      id: `appr-${a.listing_id}`,
      source: 'approval_expiry',
      title: 'Seller approval expires',
      due_at: a.approval_expires_at,
      entity: listing.business_name || 'Listing',
      listing_ref: listing.listing_ref || null,
      icon: '📝',
    })
  }

  deadlines.sort((a, b) => new Date(String(a.due_at)).getTime() - new Date(String(b.due_at)).getTime())
  return NextResponse.json({ ok: true, deadlines })
}
