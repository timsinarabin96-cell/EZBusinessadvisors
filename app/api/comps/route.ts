/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { addComp, listComps, multiplesByIndustry } from '@/lib/comps'

export const runtime = 'nodejs'

/**
 * Comps Database API
 * GET  /api/comps?agencyId=...&industry=... — list comps
 * GET  /api/comps?agencyId=...&summary=multiples — multiples by industry
 * POST /api/comps — add a comp (auto-computes multiple when blank)
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  if (req.nextUrl.searchParams.get('summary') === 'multiples') {
    const summary = await multiplesByIndustry(agencyId)
    return NextResponse.json({ ok: true, summary })
  }

  const industry = req.nextUrl.searchParams.get('industry') || 'all'
  const comps = await listComps(agencyId, industry)
  return NextResponse.json({ ok: true, comps })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

  const result = await addComp({
    agency_id: agencyId,
    business_name: body.business_name,
    industry: body.industry || null,
    location: body.location || null,
    sale_price: body.sale_price ?? null,
    revenue: body.revenue ?? null,
    sde: body.sde ?? null,
    multiple: body.multiple ?? null,
    sold_at: body.sold_at || null,
    notes: body.notes || null,
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, comp: result.comp })
}
