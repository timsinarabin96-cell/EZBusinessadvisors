/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { tierOfListing, tierAllowsAiIntake, type SellerTierId } from '@/lib/sellerTiers'
import {
  advisorProgress,
  isAdvisorComplete,
  nextAdvisorQuestionClaude,
  advisorDraftFromTranscript,
  draftPublicPreview,
  topicsRemaining,
  type AdvisorAnswer,
} from '@/lib/advisorInterview'

export const runtime = 'nodejs'

// =============================================================================
// /api/advisor/interview — Phase 1 AI Advisor Interview (spec 08-31).
//   GET  ?listingId=…  → session state: transcript, progress, next question
//   POST {listingId, answer} → append the answer, compute the adaptive next
//        question (Claude), and fold the IntakeDraft once every topic is
//        covered. Deterministic fallback when Claude is unavailable — the
//        interview never stalls, and the manual form remains the zero-AI path.
// Agency-gated: caller must belong to the listing's agency (agent/broker path;
// seller self-serve portal access arrives with the seller-tier build).
// =============================================================================

interface InterviewRow {
  id: string
  status: 'in_progress' | 'completed'
  qa: AdvisorAnswer[]
  draft: Record<string, unknown> | null
  started_at: string
  completed_at: string | null
}

async function loadOrCreate(db: ReturnType<typeof createServerClient>, listingId: string): Promise<InterviewRow | null> {
  const { data } = await db.from('advisor_interviews').select('*').eq('listing_id', listingId).maybeSingle()
  if (data) return data as unknown as InterviewRow
  const { data: created } = await db.from('advisor_interviews').insert({
    listing_id: listingId,
    status: 'in_progress',
    qa: [],
  }).select().maybeSingle()
  return (created as unknown as InterviewRow) || null
}

async function resolveListingAgency(db: ReturnType<typeof createServerClient>, listingId: string): Promise<string | null> {
  const { data } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  return (data as { agency_id?: string | null } | null)?.agency_id || null
}

/** Resolve the listing's seller tier (drives AI vs manual intake per spec). */
async function resolveListingTier(db: ReturnType<typeof createServerClient>, listingId: string): Promise<SellerTierId> {
  const { data } = await db.from('listings').select('seller_tier').eq('id', listingId).maybeSingle()
  return tierOfListing(data as { seller_tier?: string | null } | null)
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

  const row = await loadOrCreate(db, listingId)
  if (!row) return NextResponse.json({ ok: false, error: 'Could not start interview session' }, { status: 500 })

  // #2 tier gate: free-tier self-serve listings skip the AI interview — the
  // manual form (Phase 2B) is their intake path. Agents can always interview.
  const tier = await resolveListingTier(db, listingId)
  const aiAllowed = tierAllowsAiIntake(tier)

  const qa = row.qa || []
  const complete = row.status === 'completed' || isAdvisorComplete(qa)
  // Adaptive next question — Claude when available, deterministic otherwise.
  const next = complete || !aiAllowed ? null : await nextAdvisorQuestionClaude(qa)

  return NextResponse.json({
    ok: true,
    listingId,
    tier,
    aiIntakeAllowed: aiAllowed,
    status: complete ? 'completed' : aiAllowed ? 'in_progress' : 'manual_path',
    qa,
    next,
    progress: advisorProgress(qa),
    remaining: topicsRemaining(qa),
    draft: complete ? (row.draft || null) : null,
  })
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
  const listingId = String((body as Record<string, unknown>)?.listingId || '')
  const mode = String((body as Record<string, unknown>)?.mode || 'answer')
  const answer = String((body as Record<string, unknown>)?.answer || '').trim().slice(0, 3000)

  // SEED MODE (migrated from the old one-shot notes-intake route — single
  // intake surface now): paste notes/context → structured draft, no Q&A.
  // listingId is OPTIONAL here: the intake modal runs before a listing exists,
  // so seed extracts a pure draft when no listing is attached yet.
  if (mode === 'seed') {
    const notes = String((body as Record<string, unknown>)?.notes || (body as Record<string, unknown>)?.context || '').trim()
    const publicOnly = (body as Record<string, unknown>)?.publicOnly === true
    if (notes.length < 20) {
      return NextResponse.json({ ok: false, error: 'Add more detail — at least 20 characters to build the record.' }, { status: 422 })
    }
    if (listingId) {
      const agencyId = await resolveListingAgency(db, listingId)
      if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
      if (!canManageAgency(auth, agencyId)) return forbiddenResponse()
      const tier = await resolveListingTier(db, listingId)
      if (!tierAllowsAiIntake(tier)) {
        return NextResponse.json({ ok: false, error: 'Free listings use the manual form — upgrade to the AI-Verified tier for AI intake.', tier, aiIntakeAllowed: false }, { status: 403 })
      }
    }

    // Public-only seed: anonymous buyer-facing preview (never legal name /
    // address / customer / owner identity) — the old intake 'public' mode,
    // now on the single advisor intake surface.
    if (publicOnly) {
      let draft: Record<string, unknown> = {}
      try {
        draft = (await draftPublicPreview(notes)) as unknown as Record<string, unknown>
      } catch {
        draft = {}
      }
      const { draftCoverage } = await import('@/lib/listingIntakeCore')
      return NextResponse.json({
        ok: true,
        listingId: listingId || null,
        mode: 'seed-public',
        draft,
        coverage: draftCoverage(draft as never),
        message: 'Drafted anonymous public preview — review before saving.',
      })
    }

    const seedQa: AdvisorAnswer[] = [{
      questionId: `seed_${Date.now()}`,
      topic: 'business_basics',
      question: '(pasted intake notes)',
      answer: notes.slice(0, 8000),
      answeredAt: new Date().toISOString(),
    }]
    let draft: Record<string, unknown> = {}
    try {
      draft = (await advisorDraftFromTranscript(seedQa)) as unknown as Record<string, unknown>
    } catch {
      draft = {}
    }
    const { draftCoverage } = await import('@/lib/listingIntakeCore')
    return NextResponse.json({
      ok: true,
      listingId: listingId || null,
      mode: 'seed',
      draft,
      coverage: draftCoverage(draft as never),
      message: 'Drafted from pasted notes — review before saving.',
    })
  }

  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })
  if (!answer) return NextResponse.json({ ok: false, error: 'Answer is required' }, { status: 400 })

  const row = await loadOrCreate(db, listingId)
  if (!row) return NextResponse.json({ ok: false, error: 'Could not start interview session' }, { status: 500 })
  if (row.status === 'completed') {
    return NextResponse.json({ ok: false, error: 'Interview already complete' }, { status: 409 })
  }

  const qa = [...(row.qa || [])]
  // The question being answered is the one we last offered. In practice the
  // client sends the questionId+topic with the answer so the transcript is
  // self-contained (deterministic path) and the Claude path is adaptive.
  const bodyRecord = body as Record<string, unknown>
  const questionId = String(bodyRecord?.questionId || '')
  const topic = String(bodyRecord?.topic || '')
  const question = String(bodyRecord?.question || '').slice(0, 500)

  if (questionId && topic) {
    qa.push({
      questionId,
      topic: topic as AdvisorAnswer['topic'],
      question,
      answer,
      answeredAt: new Date().toISOString(),
    })
  } else {
    // No question metadata (older client) — append a minimal entry; the next
    // GET recomputes the adaptive flow from whatever topics are still open.
    qa.push({
      questionId: `raw_${qa.length + 1}`,
      topic: 'business_basics',
      question: '(client-provided answer)',
      answer,
      answeredAt: new Date().toISOString(),
    })
  }

  const complete = isAdvisorComplete(qa)
  let draft: Record<string, unknown> | null = null
  if (complete) {
    try {
      draft = (await advisorDraftFromTranscript(qa)) as unknown as Record<string, unknown>
    } catch {
      draft = null // draft is best-effort; the transcript is the source of truth
    }
  }

  await db.from('advisor_interviews').update({
    qa,
    status: complete ? 'completed' : 'in_progress',
    draft: complete ? draft : row.draft,
    completed_at: complete ? new Date().toISOString() : null,
  }).eq('id', row.id)

  const next = complete ? null : await nextAdvisorQuestionClaude(qa)

  return NextResponse.json({
    ok: true,
    listingId,
    status: complete ? 'completed' : 'in_progress',
    qa,
    next,
    progress: advisorProgress(qa),
    remaining: topicsRemaining(qa),
    draft: complete ? draft : null,
  })
}
