/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest } from '@/lib/supabase/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/share/cim-access — CIM access gate.
 * Body: { cimId, email }
 *
 * A CIM is only viewable by buyers who have SIGNED an NDA on that listing
 * (the "we qualify them first" rule, enforced server-side — the share link
 * alone is not enough). Broker/agent sessions with listing access pass too.
 *
 * Returns the full CIM content ONLY when the gate opens.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const cimId = String(body.cimId || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  if (!cimId) return NextResponse.json({ ok: false, error: 'cimId is required' }, { status: 400 })

  const { data: cim } = await db
    .from('cim_versions')
    .select('id, listing_id, content_json, status, title')
    .eq('id', cimId)
    .maybeSingle()
  if (!cim) return NextResponse.json({ ok: false, error: 'CIM not found' }, { status: 404 })

  const listingId = cim.listing_id
  if (!listingId) {
    return NextResponse.json({ ok: false, error: 'This CIM is not linked to a listing.' }, { status: 400 })
  }

  // 1) Broker/agent pass: authenticated user who can manage the listing.
  const auth = await authenticateProfileRequest(req)
  if (auth) {
    const { data: listing } = await db.from('listings').select('agency_id, agent_id').eq('id', listingId).maybeSingle()
    const { canManageListing } = await import('@/lib/supabase/auth')
    if (listing && canManageListing(auth, { agency_id: listing.agency_id, agent_id: listing.agent_id })) {
      return NextResponse.json({ ok: true, gate: 'broker', cim })
    }
  }

  // 2) Buyer pass: an NDA signed by this email on this listing.
  if (!email) {
    return NextResponse.json({
      ok: false,
      gate: 'nda',
      error: 'This CIM is confidential — enter the email you used when signing the NDA to view it.',
    }, { status: 403 })
  }

  const { data: docs } = await db.from('documents').select('id').eq('listing_id', listingId)
  const docIds = (docs || []).map((d: any) => d.id)
  if (docIds.length > 0) {
    const { data: sigs } = await db
      .from('document_signatures')
      .select('id, signed_at')
      .eq('status', 'signed')
      .eq('party_key', 'buyer')
      .in('document_id', docIds)
      .ilike('party_email', email)
      .limit(1)
    if (sigs && sigs.length > 0) {
      return NextResponse.json({ ok: true, gate: 'nda', cim })
    }
  }

  return NextResponse.json({
    ok: false,
    gate: 'nda',
    error: 'No signed NDA found for this email on this listing. The CIM is shared only with buyers who have signed the NDA — contact your broker to sign.',
  }, { status: 403 })
}
