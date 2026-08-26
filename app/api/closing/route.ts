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
  addMilestone,
  seedMilestones,
  updateMilestone,
  deleteMilestone,
  upsertEscrow,
  fetchClosingTracker,
  listTrackedListings,
  loadStageTemplate,
} from '@/lib/closingTracker'

export const runtime = 'nodejs'

/**
 * Closing & Escrow Tracker API
 *
 * GET  /api/closing?listingId=...           — milestones + escrow + progress
 * GET  /api/closing?agencyId=...&tracked=1  — listings with trackers
 * POST /api/closing  { action: 'seed' | 'milestone' | 'escrow', ... }
 * PATCH /api/closing { milestoneId, ... } | { escrowId, ... }
 * DELETE /api/closing { milestoneId }
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  if (!canManageAgency(auth, agencyId)) return forbiddenResponse()

  const listingId = req.nextUrl.searchParams.get('listingId')
  if (listingId) {
    const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
    if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
    if (listing.agency_id !== agencyId) return forbiddenResponse()
    const tracker = await fetchClosingTracker(listingId)
    if (!tracker) return NextResponse.json({ ok: false, error: 'Tracker unavailable' }, { status: 500 })
    return NextResponse.json({ ok: true, ...tracker })
  }

  if (req.nextUrl.searchParams.get('tracked') === '1') {
    const listings = await listTrackedListings(agencyId)
    return NextResponse.json({ ok: true, listings })
  }

  return NextResponse.json({ ok: false, error: 'listingId or tracked=1 required' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  if (body.listingId && !canManageAgency(auth, agencyId)) return forbiddenResponse()

  if (body.action === 'seed') {
    const { data: listing } = await db.from('listings').select('agency_id').eq('id', body.listingId).maybeSingle()
    if (!listing || listing.agency_id !== agencyId) return forbiddenResponse()
    const result = await seedMilestones(body.listingId)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'template') {
    const { data: listing } = await db.from('listings').select('agency_id').eq('id', body.listingId).maybeSingle()
    if (!listing || listing.agency_id !== agencyId) return forbiddenResponse()
    const result = await loadStageTemplate(body.listingId, String(body.stage || ''))
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, added: result.added })
  }

  if (body.action === 'milestone') {
    const { data: listing } = await db.from('listings').select('agency_id').eq('id', body.listing_id).maybeSingle()
    if (!listing || listing.agency_id !== agencyId) return forbiddenResponse()
    const result = await addMilestone({
      listing_id: body.listing_id,
      deal_id: body.deal_id || null,
      title: body.title,
      category: body.category,
      due_date: body.due_date || null,
      notes: body.notes || null,
    })
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, milestone: result.milestone })
  }

  if (body.action === 'escrow') {
    const { data: listing } = await db.from('listings').select('agency_id').eq('id', body.listing_id).maybeSingle()
    if (!listing || listing.agency_id !== agencyId) return forbiddenResponse()
    const result = await upsertEscrow({
      listing_id: body.listing_id,
      deal_id: body.deal_id || null,
      id: body.escrowId || null,
      escrow_company: body.escrow_company || null,
      account_ref: body.account_ref || null,
      amount: body.amount ?? null,
      status: body.status,
      notes: body.notes || null,
    })
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, escrow: result.escrow })
  }

  return NextResponse.json({ ok: false, error: 'action must be seed, milestone, or escrow' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (body.milestoneId) {
    const { data: m } = await db.from('deal_closing_milestones').select('agency_id, listing_id, category').eq('id', body.milestoneId).maybeSingle()
    if (!m) return NextResponse.json({ ok: false, error: 'Milestone not found' }, { status: 404 })
    if (!canManageAgency(auth, m.agency_id)) return forbiddenResponse()
    const result = await updateMilestone(
      body.milestoneId,
      {
        completed: body.completed,
        title: body.title,
        due_date: body.due_date,
        notes: body.notes,
        category: body.category,
      },
      auth.user.id,
    )
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })

    // --- Success fee hook: when the closing milestone completes, record the
    // platform's transaction cut (tiered % of the sale price). Idempotent.
    if (body.completed && m.category === 'closing') {
      try {
        const { recordSuccessFee } = await import('@/lib/successFee')
        const { data: listing } = await db
          .from('listings')
          .select('asking_price')
          .eq('id', m.listing_id)
          .maybeSingle()
        const salePrice = Number(listing?.asking_price || 0)
        if (salePrice > 0) {
          const fee = await recordSuccessFee({
            agencyId: m.agency_id,
            listingId: m.listing_id,
            dealId: null,
            salePrice,
            notes: 'Auto-recorded when closing milestone completed',
          })
          return NextResponse.json({ ok: true, successFee: fee.fee ?? null })
        }
      } catch { /* fee recording is best-effort */ }
    }

    return NextResponse.json({ ok: true })
  }

  if (body.escrowId) {
    const { data: e } = await db.from('deal_escrow_accounts').select('agency_id, listing_id').eq('id', body.escrowId).maybeSingle()
    if (!e) return NextResponse.json({ ok: false, error: 'Escrow not found' }, { status: 404 })
    if (!canManageAgency(auth, e.agency_id)) return forbiddenResponse()
    const result = await upsertEscrow({
      listing_id: e.listing_id,
      id: body.escrowId,
      escrow_company: body.escrow_company,
      account_ref: body.account_ref,
      amount: body.amount,
      status: body.status,
      notes: body.notes,
    })
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'milestoneId or escrowId required' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (!body.milestoneId) return NextResponse.json({ ok: false, error: 'milestoneId required' }, { status: 400 })
  const { data: m } = await db.from('deal_closing_milestones').select('agency_id').eq('id', body.milestoneId).maybeSingle()
  if (!m) return NextResponse.json({ ok: false, error: 'Milestone not found' }, { status: 404 })
  if (!canManageAgency(auth, m.agency_id)) return forbiddenResponse()
  const result = await deleteMilestone(body.milestoneId)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
