/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

const DELETE_REASONS = ['duplicate', 'sold_or_withdrawn', 'seller_cancelled', 'wrong_data', 'test_listing', 'other']

/**
 * DELETE /api/listings/[id] — trash a listing (soft delete) with a REQUIRED
 * reason. Permissions:
 *   - The agent who CREATED the listing can always trash it.
 *   - Agency owner/admin can trash it ONLY when the creator is gone
 *     (profile deleted / inactive / agent_id unset) — otherwise creators own
 *     their listings and no one else touches them.
 * The listing row is kept (status='deleted') so it can be restored; the
 * public_listings row is removed so it vanishes from the marketplace.
 * Every deletion writes a listing_review_events entry (audit trail) that
 * surfaces in the activity feed, plus structured metadata in ai_metadata
 * for the broker's deletion log.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'listing id required' }, { status: 400 })

  // Parse + validate the required reason (JSON body — no reason, no delete).
  let reason = ''
  let note = ''
  try {
    const body = await req.json().catch(() => ({}))
    reason = String(body?.reason || '').trim()
    note = String(body?.note || '').trim()
  } catch {
    /* body optional except reason */
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: 'A deletion reason is required' }, { status: 400 })
  }
  if (!DELETE_REASONS.includes(reason)) {
    return NextResponse.json({ ok: false, error: 'Invalid deletion reason' }, { status: 400 })
  }
  if (reason === 'other' && !note) {
    return NextResponse.json({ ok: false, error: 'A note is required when reason is "Other"' }, { status: 400 })
  }

  const { data: listing } = await db.from('listings').select('id, agency_id, agent_id, business_name, status, ai_metadata').eq('id', id).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  // ── Permission: creator-only, with owner/admin override when creator is gone ──
  const isCreator = listing.agent_id === auth.user.id
  if (!isCreator) {
    const isOwnerAdmin = canManageAgency(auth, listing.agency_id)
    let creatorGone = true
    if (listing.agent_id) {
      const { data: creatorProfile } = await db
        .from('profiles')
        .select('id, status')
        .eq('id', listing.agent_id)
        .maybeSingle()
      creatorGone = !creatorProfile || creatorProfile.status === 'inactive' || creatorProfile.status === 'locked' || creatorProfile.status === 'banned'
    }
    if (!isOwnerAdmin || !creatorGone) {
      return forbiddenResponse('Only the agent who created this listing can delete it')
    }
  }

  const now = new Date().toISOString()
  const meta = (listing.ai_metadata || {}) as Record<string, unknown>

  // Soft delete: status='deleted' + structured deletion metadata (for the
  // broker's log + restore). Keep the row and gallery files so restore works.
  const { error } = await db.from('listings').update({
    status: 'deleted',
    ai_metadata: {
      ...meta,
      deletion: {
        reason,
        note: note || null,
        deleted_by: auth.user.id,
        deleted_by_role: auth.profile.role,
        deleted_at: now,
        previous_status: listing.status || 'draft',
      },
    },
  }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Remove from the public marketplace feed.
  await Promise.resolve(db.from('public_listings').delete().eq('listing_id', id).maybeSingle()).catch(() => {})

  // Audit trail — surfaces in the activity feed automatically.
  await Promise.resolve(db.from('listing_review_events').insert({
    agency_id: listing.agency_id,
    listing_id: id,
    actor_id: auth.user.id,
    from_stage: listing.status || 'draft',
    to_stage: 'deleted',
    notes: `${reason}${note ? ` — ${note}` : ''}`,
  }).maybeSingle()).catch(() => {})

  return NextResponse.json({ ok: true, status: 'deleted', reason, note: note || null })
}
