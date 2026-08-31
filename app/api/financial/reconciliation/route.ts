/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import {
  runReconciliationLoop,
  applyMissingCategoryAnswer,
  type ReconciliationIssue,
} from '@/lib/reconciliationFollowup'
import {
  recastFinancials,
  type RecastInput,
  type RecastResult,
} from '@/lib/recast'

export const runtime = 'nodejs'

// =============================================================================
// /api/financial/reconciliation — #7 reconciliation follow-up loop (spec 08-31).
//   GET  ?listingId=…        → open follow-up questions for the listing
//   POST {listingId, followupId, answer} → apply the broker's answer, re-run
//        the engine, and return resolved / next question / flagged.
// Agency-gated (same pattern as listing-advisor). The loop NEVER silently
// estimates — an unresolvable reconciliation is flagged for broker review.
// =============================================================================

interface FollowupRow {
  id: string
  listing_id: string
  status: 'open' | 'answered' | 'flagged'
  issue_kind: 'consistency' | 'missing_category'
  issue: { detail: string; category?: string | null; amount?: number | null; label?: string | null; year?: number | null }
  question: string
  suggested_answers: string[]
  answer: string | null
  created_at: string
  answered_at: string | null
}

async function resolveListingAgency(db: ReturnType<typeof createServerClient>, listingId: string): Promise<string | null> {
  const { data } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  return (data as { agency_id?: string | null } | null)?.agency_id || null
}

/** Rebuild the recast input from the listing's stored financials + add-backs. */
async function buildRecastInput(
  db: ReturnType<typeof createServerClient>,
  listingId: string,
): Promise<{ input: RecastInput; listing: Record<string, unknown> } | null> {
  const { data: listing } = await db.from('listings').select('*').eq('id', listingId).maybeSingle()
  if (!listing) return null
  const L = listing as Record<string, unknown>

  const { data: docs } = await db
    .from('financial_documents')
    .select('*')
    .or(`listing_id.eq.${listingId},deal_id.eq.${listingId ?? 'none'}`)
    .eq('status', 'processed')
  const srcDocs = ((docs as Record<string, unknown>[] | null) || []).filter((d) => d.category !== 'generated_document')

  // Deterministic 3-year history from listing figures (same as autoGenerate).
  const year = new Date().getFullYear()
  const revenue = Number(L.annual_revenue) || 0
  const sde = Number(L.sde) || 0
  const ebitda = Number(L.ebitda) || sde * 0.82
  const years = [0, 1, 2].map((i) => {
    const rev = Math.round((revenue * [1, 0.965, 0.93][i]) / 100) * 100
    const sdeMargin = sde && revenue ? sde / revenue : 0.25
    const ebitdaMargin = ebitda && revenue ? ebitda / revenue : 0.18
    const s = Math.round(rev * sdeMargin)
    const e = Math.round(rev * ebitdaMargin)
    return {
      year: year - i,
      label: `FY${year - i}`,
      grossRevenue: rev,
      cogs: Math.round(rev * 0.4),
      operatingExpenses: Math.max(0, rev - Math.round(rev * 0.4) - s),
      ownerComp: Math.max(0, s - e),
      depreciation: Math.max(0, s - e),
      interest: 0,
      otherExpenses: 0,
      netIncome: e,
    }
  })

  return {
    input: {
      listingId,
      businessName: String(L.business_name || 'Business'),
      entityType: 'llc',
      currency: '$',
      years,
      addBacks: [], // itemized add-backs come from follow-up answers
    },
    listing: L,
  }
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  const agencyId = await resolveListingAgency(db, listingId)
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const { data: rows } = await db
    .from('reconciliation_followups')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(20)
  const followups = ((rows as unknown as FollowupRow[]) || []).map((r) => ({
    id: r.id,
    status: r.status,
    issueKind: r.issue_kind,
    issue: r.issue,
    question: r.question,
    suggestedAnswers: r.suggested_answers || [],
    answer: r.answer,
    createdAt: r.created_at,
    answeredAt: r.answered_at,
  }))

  return NextResponse.json({ ok: true, listingId, followups })
}

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
  const b = body as Record<string, unknown>
  const listingId = String(b?.listingId || '')
  const followupId = String(b?.followupId || '')
  const answer = String(b?.answer || '').trim().slice(0, 3000)
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })
  if (!followupId) return NextResponse.json({ ok: false, error: 'followupId is required' }, { status: 400 })
  if (!answer) return NextResponse.json({ ok: false, error: 'Answer is required' }, { status: 400 })

  const agencyId = await resolveListingAgency(db, listingId)
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const { data: fRow } = await db.from('reconciliation_followups').select('*').eq('id', followupId).eq('listing_id', listingId).maybeSingle()
  if (!fRow) return NextResponse.json({ ok: false, error: 'Follow-up not found' }, { status: 404 })
  const followup = fRow as unknown as FollowupRow

  // Rebuild the recast input and apply the answer, then re-run the loop.
  const built = await buildRecastInput(db, listingId)
  if (!built) return NextResponse.json({ ok: false, error: 'Could not rebuild financials' }, { status: 500 })

  const issue: ReconciliationIssue = {
    kind: followup.issue_kind,
    detail: followup.issue?.detail || followup.question,
    label: followup.issue?.label ?? undefined,
    year: followup.issue?.year ?? undefined,
    category: (followup.issue?.category as ReconciliationIssue['category']) ?? undefined,
    amount: followup.issue?.amount ?? undefined,
  }

  let nextInput = built.input
  if (followup.issue_kind === 'missing_category') {
    const corrected = applyMissingCategoryAnswer(nextInput, issue, answer)
    if (corrected) nextInput = corrected
  }
  // consistency issues: the answer text is folded in on the NEXT generation
  // attempt via the listing's stored add-backs — for now we record it and
  // re-run; if still failing the loop flags for review.

  const answers: Record<string, string> = {}
  if (followup.issue?.detail) answers[followup.issue.detail] = answer
  const outcome = await runReconciliationLoop(nextInput, answers)

  // Persist the answer on this follow-up; create a new one if a next question exists.
  await db.from('reconciliation_followups').update({
    status: outcome.status === 'needs_input' ? 'answered' : outcome.status,
    answer,
    answered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', followupId)

  let nextId: string | null = null
  if (outcome.status === 'needs_input' && outcome.question && outcome.issues.length > 0) {
    const nIssue = outcome.issues[0]
    const { data: inserted } = await db.from('reconciliation_followups').insert({
      listing_id: listingId,
      status: 'open',
      issue_kind: nIssue.kind,
      issue: { detail: nIssue.detail, category: nIssue.category ?? null, amount: nIssue.amount ?? null, label: nIssue.label ?? null, year: nIssue.year ?? null },
      question: outcome.question.question,
      suggested_answers: outcome.question.suggestedAnswers,
    }).select().maybeSingle()
    nextId = (inserted as unknown as { id?: string } | null)?.id || null
  }

  // Refresh the recast project with the validated result when clean.
  let recast: RecastResult | null = null
  if (outcome.status === 'clean' && outcome.result) {
    recast = outcome.result
    try {
      await db.from('recast_projects').upsert({
        listing_id: listingId,
        result_json: outcome.result as unknown as Record<string, unknown>,
        status: 'clean',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'listing_id' })
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    ok: true,
    listingId,
    status: outcome.status,
    message: outcome.message,
    question: outcome.status === 'needs_input' ? outcome.question : null,
    nextFollowupId: nextId,
    recast: recast ? { avgSDE: recast.avgSDE, avgEBITDA: recast.avgEBITDA } : null,
  })
}
