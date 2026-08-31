/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { buildAdvanceFields } from '@/lib/advanceToListing'
import { tierOfListing } from '@/lib/sellerTiers'
import type { RecastResult } from '@/lib/recast'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/listings/advance — #8 one-shot Advance to Listing (spec Phase 4).
//   Body: { listingId }
// Pulls validated recast + BOV + CIM/interview output into the listing record
// in one action. Tier-gated (free → manual-only / Self-Reported; paid → full
// AI path / AI-Verified Financials). Reconciliation invariant is enforced —
// an inconsistent recast REFUSES to advance. Never publishes; the publish
// gate (identity/legitimacy/seller approval) still applies afterward.
// =============================================================================

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }
  const listingId = String((body as Record<string, unknown>)?.listingId || '')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  const { data: listing } = await db.from('listings').select('*').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, (listing as { agency_id?: string | null }).agency_id)) return forbiddenResponse()

  const tier = tierOfListing(listing as { seller_tier?: string | null })

  // Load the latest validated recast for this listing.
  let recast: RecastResult | null = null
  try {
    const { data: project } = await db.from('recast_projects').select('result_json').eq('listing_id', listingId).order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (project?.result_json) recast = project.result_json as RecastResult
  } catch { /* recast optional */ }

  // BOV + CIM narrative from generated docs if present.
  let bov: { valuationRange?: string; conclusion?: string; askingPriceSuggestion?: number } | undefined
  let cimNarrative: string | null = null
  try {
    const { data: docs } = await db.from('financial_documents').select('notes, file_name').eq('listing_id', listingId).eq('category', 'generated_document').in('status', ['bov_done', 'cim_done'])
    const rows = (docs || []) as Array<{ notes: string | null; file_name: string }>
    const bovDoc = rows.find((d) => /bov/i.test(d.file_name))
    if (bovDoc?.notes) {
      const m = bovDoc.notes.match(/Valuation range: ([^;]+)/)
      if (m) bov = { valuationRange: m[1].trim() }
    }
    const cimDoc = rows.find((d) => /cim/i.test(d.file_name))
    if (cimDoc?.notes) cimNarrative = cimDoc.notes
  } catch { /* best-effort */ }

  // Interview draft (advisor interview) when complete.
  let interviewDraft: Record<string, unknown> | null = null
  try {
    const { data: adv } = await db.from('advisor_interviews').select('draft').eq('listing_id', listingId).eq('status', 'completed').maybeSingle()
    if (adv?.draft) interviewDraft = adv.draft as Record<string, unknown>
  } catch { /* optional */ }

  const result = buildAdvanceFields({
    listingId,
    businessName: String((listing as { business_name?: string }).business_name || 'Business'),
    tier,
    recast,
    bov,
    cim: cimNarrative ? { narrative: cimNarrative } : undefined,
    interviewDraft,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, blocked: result.blocked === true }, { status: result.blocked ? 409 : 500 })
  }

  // Write the advanced fields (null sentinels are skipped).
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(result.fields || {})) {
    if (v === null) continue
    patch[k] = v
  }
  patch.trust_label = result.trustLabel
  patch.ai_advance_at = new Date().toISOString()

  const { data: updated, error } = await db.from('listings').update(patch).eq('id', listingId).select('id, business_name, sde, ebitda, annual_revenue, asking_price, seller_tier, trust_label').maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    listingId,
    tier,
    trustLabel: result.trustLabel,
    fields: updated,
    message: tier === 'paid'
      ? 'Advanced AI-verified figures + narrative to the listing. Review, then publish.'
      : 'Free tier: manual entry only — your entered figures are preserved and the listing is labeled Self-Reported.',
  })
}
