/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { runBankBooksVerification } from '@/lib/bankBooksVerification'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/admin/verify-unlock — the boss's "can my admin AI verify and
// unlock them?" flow, one button in the moderation screen:
//
//   action=verify  → runs the FULL verification stack on a listing:
//                    • extraction coverage (how many docs read, confidence)
//                    • bank-vs-books check (deposits vs reported revenue)
//                    • seller accuracy interview status (transcript?)
//                    Returns a report — nothing is changed.
//
//   action=unlock  → grants the upsell unlocks for a listing/agency:
//                    • revenue_verified badge on public_listings (trust layer)
//                    • featured placement (public feed priority)
//                    • financial_intelligence add-on for the agency
//                    Admin-granted (demos/partners) OR after payment — the
//                    webhook already handles paid featured/verified paths.
//
// Platform admin only. Every action is audit-logged.
// =============================================================================

const schema = z.object({
  listingId: z.string().uuid(),
  action: z.enum(['verify', 'unlock']),
  unlockFlags: z.array(z.enum(['verified', 'featured', 'financial_intelligence'])).optional(),
})

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed', detail: parsed.error.issues[0]?.message }, { status: 422 })
  }
  const { listingId, action, unlockFlags } = parsed.data

  // Load the listing + its agency.
  const { data: listing } = await db
    .from('listings')
    .select('id, agency_id, business_name, annual_revenue, sde, ebitda, status, review_stage')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  const L = listing as { id: string; agency_id: string | null; business_name: string | null }

  // -------------------------------------------------------------------------
  // action=verify — run the full stack, report only.
  // -------------------------------------------------------------------------
  if (action === 'verify') {
    const { data: docs } = await db
      .from('financial_documents')
      .select('id, fiscal_year, category, upload_source')
      .eq('listing_id', listingId)
      .neq('category', 'generated_document')
      .limit(100)
    const sourceDocs = (docs || []).filter((d: { category: string }) => d.category !== 'generated_document')

    const { data: extractions } = await db
      .from('financial_extractions')
      .select('id, fiscal_year, doc_type, confidence, review_state')
      .eq('listing_id', listingId)
    const extRows = (extractions || []) as Array<{ review_state: string; confidence: number }>
    const reviewed = extRows.filter((e) => e.review_state === 'approved' || e.review_state === 'overridden')
    const avgConfidence = extRows.length
      ? Math.round((extRows.reduce((sum, e) => sum + Number(e.confidence) || 0, 0) / extRows.length) * 100)
      : 0

    const { data: interview } = await db.from('financial_interviews').select('status, qa').eq('listing_id', listingId).maybeSingle()
    const interviewAnswers = Array.isArray((interview as { qa?: unknown[] } | null)?.qa) ? ((interview as { qa: unknown[] }).qa.length) : 0

    // Bank-vs-books (only if the listing has an agency for the verified row).
    let bankBooks: Awaited<ReturnType<typeof runBankBooksVerification>>['verdict'] | null = null
    if (L.agency_id) {
      const res = await runBankBooksVerification(listingId, L.agency_id)
      if (res.ok && res.verdict) bankBooks = res.verdict
    }

    const report = {
      listingId,
      business_name: L.business_name,
      documents: sourceDocs.length,
      sellerUploads: sourceDocs.filter((d: { upload_source: string }) => d.upload_source === 'seller').length,
      extractions: extRows.length,
      reviewedExtractions: reviewed.length,
      avgConfidence,
      sellerInterview: interviewAnswers,
      bankBooks: bankBooks
        ? { status: bankBooks.status, variancePct: bankBooks.variancePct, bankDeposits: bankBooks.bankDeposits }
        : null,
      overall: extRows.length === 0 ? 'no_financials' : reviewed.length === 0 ? 'extracted_unreviewed' : 'ready',
    }

    // Audit log.
    try {
      await db.from('admin_audit_log').insert({
        actor_id: null,
        actor_email: 'platform-admin',
        action: 'ai_verify',
        target_type: 'listing',
        target_id: listingId,
        target_label: L.business_name || listingId,
        details: { report },
      })
    } catch { /* audit best-effort */ }

    return NextResponse.json({ ok: true, action: 'verify', report })
  }

  // -------------------------------------------------------------------------
  // action=unlock — grant the upsell unlocks.
  // -------------------------------------------------------------------------
  const flags = unlockFlags || ['verified', 'featured', 'financial_intelligence']
  const granted: string[] = []
  const skipped: string[] = []

  if (flags.includes('verified')) {
    // Trust badge on the public feed (revenue_verified column).
    const { error } = await db.from('public_listings').update({ revenue_verified: true }).eq('listing_id', listingId)
    if (!error) granted.push('verified_revenue_badge')
    else skipped.push('verified_revenue_badge')
  }

  if (flags.includes('featured')) {
    // Featured: mark the public feed row featured (top of the marketplace).
    const { error } = await db.from('public_listings').update({ is_featured: true }).eq('listing_id', listingId)
    if (!error) granted.push('featured_placement')
    else skipped.push('featured_placement')
  }

  if (flags.includes('financial_intelligence') && L.agency_id) {
    // Add-on: enable Financial Intelligence for the listing's agency.
    const { error } = await db.from('agency_settings').upsert(
      { agency_id: L.agency_id, financial_intelligence_enabled: true, updated_at: new Date().toISOString() },
      { onConflict: 'agency_id' },
    )
    if (!error) granted.push('financial_intelligence_addon')
    else skipped.push('financial_intelligence_addon')
  }

  try {
    await db.from('admin_audit_log').insert({
      actor_id: null,
      actor_email: 'platform-admin',
      action: 'ai_unlock',
      target_type: 'listing',
      target_id: listingId,
      target_label: L.business_name || listingId,
      details: { granted, skipped },
    })
  } catch { /* audit best-effort */ }

  return NextResponse.json({ ok: true, action: 'unlock', granted, skipped })
}
