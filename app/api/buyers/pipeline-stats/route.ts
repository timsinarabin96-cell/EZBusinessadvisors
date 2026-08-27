/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { pipelineFunnel, conversionRate, ACTIVE_STAGES, BUYER_STAGES, heatBand, type BuyerStage } from '@/lib/buyerPipelineCore'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/buyers/pipeline-stats?agencyId= — agency-wide pipeline health.
// Aggregates buyer_lists across ALL of the agency's listings into a funnel,
// with conversion rates and heat distribution. Drives the pipeline dashboard.
// =============================================================================

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  // All listings for the agency (for per-listing breakdown).
  const { data: listings } = await db
    .from('listings')
    .select('id, business_name, status, agency_id')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(500)

  const listingIds = (listings || []).map((l: any) => l.id)
  if (listingIds.length === 0) {
    return NextResponse.json({ ok: true, funnel: {}, conversions: {}, heat: { hot: 0, warm: 0, cool: 0, cold: 0 }, perListing: [], totalBuyers: 0 })
  }

  const { data: buyers } = await db
    .from('buyer_lists')
    .select('id, listing_id, pipeline_stage, heat_score, nda_signed, financial_qualified')
    .in('listing_id', listingIds)
    .limit(2000)

  const rows = (buyers || []) as any[]

  // Agency-wide funnel.
  const funnel = pipelineFunnel(rows)

  // Heat distribution.
  const heat = { hot: 0, warm: 0, cool: 0, cold: 0 }
  for (const b of rows) {
    const band = heatBand(Number(b.heat_score) || 0).label
    if (band.includes('Hot')) heat.hot += 1
    else if (band === 'Warm') heat.warm += 1
    else if (band === 'Cool') heat.cool += 1
    else heat.cold += 1
  }

  // Conversions: qualified → LOI → closed.
  const conversions = {
    toLoi: conversionRate(funnel, 'qualified', 'loi'),
    toClosed: conversionRate(funnel, 'qualified', 'closed'),
    overall: conversionRate(funnel, 'new', 'closed'),
  }

  // Per-listing breakdown.
  const perListing = (listings || []).map((l: any) => {
    const lb = rows.filter((b: any) => b.listing_id === l.id)
    return {
      listingId: l.id,
      businessName: (l as any).business_name,
      status: (l as any).status,
      total: lb.length,
      active: lb.filter((b: any) => ACTIVE_STAGES.includes(b.pipeline_stage as BuyerStage)).length,
      closed: lb.filter((b: any) => b.pipeline_stage === 'closed').length,
      hot: lb.filter((b: any) => (Number(b.heat_score) || 0) >= 70).length,
    }
  }).sort((a, b) => b.total - a.total)

  return NextResponse.json({
    ok: true,
    funnel,
    conversions,
    heat,
    perListing,
    totalBuyers: rows.length,
    activeBuyers: rows.filter((b: any) => ACTIVE_STAGES.includes(b.pipeline_stage as BuyerStage)).length,
    stageMeta: BUYER_STAGES.map((s) => ({ stage: s, label: s })),
  })
}
