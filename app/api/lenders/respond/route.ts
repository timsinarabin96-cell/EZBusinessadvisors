/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// =============================================================================
// Lender respond — the lender (via secure token) marks a deal prequalified or
// declined, optionally with max loan amount + terms. Token is the auth.
// =============================================================================

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const token = String(body.token || '')
  const status = String(body.status || '')
  if (!token) return NextResponse.json({ ok: false, error: 'token is required' }, { status: 400 })
  if (!['prequalified', 'declined'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'status must be prequalified or declined' }, { status: 400 })
  }

  const { data: q } = await db
    .from('lender_qualifications')
    .select('id, deal_id, status, agency_id, lender_id')
    .eq('token', token)
    .maybeSingle()
  if (!q) return NextResponse.json({ ok: false, error: 'Link not found or expired' }, { status: 404 })

  const patch: Record<string, unknown> = {
    status,
    responded_at: new Date().toISOString(),
  }
  if (body.maxLoanAmount != null && body.maxLoanAmount !== '') patch.max_loan_amount = Number(body.maxLoanAmount)
  if (body.terms !== undefined) patch.terms = String(body.terms).trim().slice(0, 500) || null
  if (body.notes !== undefined) patch.notes = String(body.notes).trim().slice(0, 1000) || null

  const { error } = await db.from('lender_qualifications').update(patch).eq('id', q.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Best-effort: notify the requesting broker that the lender responded.
  void (async () => {
    try {
      const { data: deal } = await db.from('deals').select('id, listing_id').eq('id', q.deal_id).maybeSingle()
      const listingId = (deal as { listing_id?: string | null } | null)?.listing_id
      if (listingId) {
        const { data: listing } = await db.from('listings').select('business_name, agency_id').eq('id', listingId).maybeSingle()
        const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id || q.agency_id
        if (agencyId) {
          const { createNotification } = await import('@/lib/notifications')
          await createNotification({
            agency_id: agencyId,
            title: status === 'prequalified' ? '🏦 Deal prequalified by lender' : '🏦 Lender declined deal',
            body: `${(listing as { business_name?: string | null } | null)?.business_name || 'A deal'} was marked ${status} by a lender partner.`,
            kind: 'loan',
            link: '/pipeline',
          })
        }
      }
    } catch { /* best-effort */ }
  })()

  return NextResponse.json({ ok: true, status })
}
