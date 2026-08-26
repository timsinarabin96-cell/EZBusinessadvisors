/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { runBankBooksVerification } from '@/lib/bankBooksVerification'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/financial/verify — bank-vs-books verification (red-flag check).
// Body: { listingId }
// Compares approved/overridden bank-statement deposits against reported
// revenue, stores the verdict on verified_financials, and syncs the public
// revenue_verified badge. Agency-gated.
// =============================================================================

const schema = z.object({ listingId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user) return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed: listingId (uuid) required.' }, { status: 422 })
  }
  const { listingId } = parsed.data

  // Agency gate
  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  const { data: memberships } = await db.from('agency_members').select('agency_id').eq('profile_id', auth.user.id)
  const mine = new Set((memberships || []).map((m: { agency_id: string }) => m.agency_id))
  if (!mine.has(agencyId)) {
    const { data: prof } = await db.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
    if (prof?.role !== 'admin' && prof?.role !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency' }, { status: 403 })
    }
  }

  const result = await runBankBooksVerification(listingId, agencyId)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error || 'Verification failed' }, { status: 500 })

  return NextResponse.json({ ok: true, verdict: result.verdict })
}
