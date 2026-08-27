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

/**
 * POST /api/listings/[id]/restore — pull a trashed listing back from the
 * deleted state. Permissions mirror the delete route: the creating agent, or
 * an agency owner/admin (creator-gone override is not needed for restore —
 * owner/admin can always restore).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'listing id required' }, { status: 400 })

  const { data: listing } = await db.from('listings').select('id, agency_id, agent_id, business_name, status, ai_metadata').eq('id', id).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const canRestore = canManageAgency(auth, listing.agency_id) || listing.agent_id === auth.user.id
  if (!canRestore) return forbiddenResponse()

  if (listing.status !== 'deleted') {
    return NextResponse.json({ ok: false, error: 'Listing is not deleted' }, { status: 400 })
  }

  const meta = (listing.ai_metadata || {}) as Record<string, unknown>
  const deletion = (meta.deletion || {}) as Record<string, unknown>
  const previousStatus = typeof deletion.previous_status === 'string' ? deletion.previous_status : 'draft'
  const cleanMeta: Record<string, unknown> = { ...meta }
  delete cleanMeta.deletion

  const { error } = await db.from('listings').update({
    status: previousStatus,
    ai_metadata: cleanMeta,
  }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Audit trail — surfaces in the activity feed automatically.
  await Promise.resolve(db.from('listing_review_events').insert({
    agency_id: listing.agency_id,
    listing_id: id,
    actor_id: auth.user.id,
    from_stage: 'deleted',
    to_stage: previousStatus,
    notes: 'Restored from trash',
  }).maybeSingle()).catch(() => {})

  return NextResponse.json({ ok: true, status: previousStatus })
}
