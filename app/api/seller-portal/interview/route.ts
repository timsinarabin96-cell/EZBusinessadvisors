/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { buildInterviewQuestions, isInterviewComplete, questionsRemaining, type InterviewContext, type QaEntry } from '@/lib/financialInterview'

export const runtime = 'nodejs'

// =============================================================================
// /api/seller-portal/interview — AI financial accuracy interview.
//   GET  ?token=***          → transcript + next question (context-driven)
//   POST ?token=***  {a}     → append the seller's answer, advance the flow,
//                              and mark seller_confirmed_at when complete.
// Token-gated (seller portal), no login.
// =============================================================================

async function resolveListingByToken(db: ReturnType<typeof createServerClient>, token: string): Promise<string | null> {
  const { data: lead } = await db
    .from('seller_leads')
    .select('converted_listing_id')
    .eq('portal_token', token)
    .maybeSingle()
  if (lead?.converted_listing_id) return (lead as { converted_listing_id: string }).converted_listing_id
  const { data: byToken } = await db.from('listings').select('id').eq('portal_token', token).maybeSingle()
  return (byToken as { id?: string } | null)?.id || null
}

async function buildContext(db: ReturnType<typeof createServerClient>, listingId: string): Promise<InterviewContext> {
  const { data: docs } = await db
    .from('financial_documents')
    .select('fiscal_year, category')
    .eq('listing_id', listingId)
    .neq('category', 'generated_document')
  const rows = (docs || []) as Array<{ fiscal_year: number | null; category: string }>
  const docYears = Array.from(new Set(rows.map((r) => r.fiscal_year).filter((y): y is number => y != null))).sort()
  const hasBankStatements = rows.some((r) => /bank|statement/i.test(r.category))

  const { data: vf } = await db.from('verified_financials').select('status, verification_detail').eq('listing_id', listingId).maybeSingle()
  const detail = (vf as { verification_detail?: { status?: string; variancePct?: number | null } | null } | null)?.verification_detail || null
  const bankBooksVerdict = detail?.status === 'verified' ? 'verified' : detail?.status === 'failed' ? 'review' : hasBankStatements ? 'review' : null

  return {
    hasDocs: rows.length > 0,
    docYears,
    hasBankStatements,
    bankBooksVerdict,
    variancePct: detail?.variancePct ?? null,
    docCount: rows.length,
  }
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const token = req.nextUrl.searchParams.get('token') || ''
  if (!token || token.length < 12) {
    return NextResponse.json({ ok: false, error: 'Invalid link' }, { status: 400 })
  }
  const listingId = await resolveListingByToken(db, token)
  if (!listingId) {
    return NextResponse.json({ ok: false, error: 'Your listing is still being set up — check back soon.' }, { status: 409 })
  }

  const ctx = await buildContext(db, listingId)
  const { data: interview } = await db.from('financial_interviews').select('*').eq('listing_id', listingId).maybeSingle()
  const qa = ((interview as { qa?: QaEntry[] } | null)?.qa || []) as QaEntry[]
  const questions = buildInterviewQuestions(ctx)
  const next = qa.length < questions.length ? questions[qa.length] : null
  const complete = isInterviewComplete(qa.length, ctx)

  return NextResponse.json({
    ok: true,
    qa,
    next,
    complete,
    remaining: questionsRemaining(qa.length, ctx),
    total: questions.length,
  })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const token = req.nextUrl.searchParams.get('token') || ''
  if (!token || token.length < 12) {
    return NextResponse.json({ ok: false, error: 'Invalid link' }, { status: 400 })
  }
  const listingId = await resolveListingByToken(db, token)
  if (!listingId) {
    return NextResponse.json({ ok: false, error: 'Your listing is still being set up — check back soon.' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const answer = String(body?.a || '').trim().slice(0, 2000)
  if (!answer) return NextResponse.json({ ok: false, error: 'Answer is required' }, { status: 400 })

  const ctx = await buildContext(db, listingId)
  const questions = buildInterviewQuestions(ctx)

  // Load or create the interview row.
  const { data: existing } = await db.from('financial_interviews').select('*').eq('listing_id', listingId).maybeSingle()
  const qa = ((existing as { qa?: QaEntry[] } | null)?.qa || []) as QaEntry[]
  const idx = qa.length
  if (idx >= questions.length) {
    return NextResponse.json({ ok: false, error: 'Interview already complete' }, { status: 409 })
  }
  const entry: QaEntry = {
    q: questions[idx].question,
    a: answer,
    askedAt: existing ? new Date().toISOString() : new Date().toISOString(),
    answeredAt: new Date().toISOString(),
  }
  qa.push(entry)

  const complete = qa.length >= questions.length
  if (existing) {
    await db.from('financial_interviews').update({
      qa,
      status: complete ? 'completed' : 'in_progress',
      completed_at: complete ? new Date().toISOString() : null,
    }).eq('id', (existing as { id: string }).id)
  } else {
    await db.from('financial_interviews').insert({
      listing_id: listingId,
      qa,
      status: complete ? 'completed' : 'in_progress',
      completed_at: complete ? new Date().toISOString() : null,
    })
  }

  // Seller attestation timestamp on the verified record once complete.
  if (complete) {
    try {
      await db.from('verified_financials').update({
        seller_confirmed_at: new Date().toISOString(),
      }).eq('listing_id', listingId)
    } catch { /* best-effort */ }
  }

  const next = qa.length < questions.length ? questions[qa.length] : null
  return NextResponse.json({
    ok: true,
    qa,
    next,
    complete,
    remaining: questionsRemaining(qa.length, ctx),
    total: questions.length,
  })
}
