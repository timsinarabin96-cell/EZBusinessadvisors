/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageListing, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createNotification } from '@/lib/notifications'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

// =============================================================================
// PATCH /api/listings/[id]/price — broker approves/rejects an owner-requested
// price change (stored on listings.ai_metadata.pending_price_change by
// POST /api/owner/listings/[id]/price). This is the money gate: asking_price
// is only ever written HERE, by a broker, never by the seller.
//   body: { action: 'approve' | 'reject', notes? }
//   approve → writes asking_price from the pending request, clears the meta,
//             audits, notifies the owner (in-app + email if cheap).
//   reject  → clears the meta with a reason, audits, notifies the owner.
// Reuses the same review-queue authorization (canManageListing) the broker
// approve/reject flow already uses in app/api/listings/review/route.ts.
// =============================================================================

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }
  const action = String(body?.action || '')
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) : null
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ ok: false, error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  const { data: listing } = await db
    .from('listings')
    .select('id, agency_id, agent_id, business_name, owner_email, ai_metadata, asking_price')
    .eq('id', id)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'listing not found' }, { status: 404 })
  if (!canManageListing(authenticated, { agency_id: listing.agency_id, agent_id: listing.agent_id ?? null })) return forbiddenResponse()

  const meta = (listing.ai_metadata || {}) as Record<string, unknown>
  const pending = meta.pending_price_change as { asking_price?: number; previous_asking_price?: number | null; reason?: string | null } | undefined
  if (!pending || typeof pending.asking_price !== 'number') {
    return NextResponse.json({ ok: false, error: 'No pending price change on this listing' }, { status: 404 })
  }

  const restMeta = { ...meta }
  delete restMeta.pending_price_change

  const patch: Record<string, unknown> = { ai_metadata: restMeta, updated_at: new Date().toISOString() }
  if (action === 'approve') {
    patch.asking_price = pending.asking_price
  }

  const { error } = await db.from('listings').update(patch).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  try {
    const { recordAdminAudit } = await import('@/lib/adminAudit')
    await recordAdminAudit({
      actorId: authenticated.user.id,
      actorEmail: authenticated.user.email || null,
      action: action === 'approve' ? 'owner_price_change_approved' : 'owner_price_change_rejected',
      targetType: 'listing',
      targetId: id,
      targetLabel: listing.business_name || null,
      details: { requested_asking_price: pending.asking_price, previous_asking_price: pending.previous_asking_price ?? null, reason: pending.reason ?? null, notes },
    })
  } catch { /* audit is best-effort */ }

  // Notify the owner — in-app + email, best-effort.
  const title = action === 'approve'
    ? `Price change approved: ${listing.business_name || 'your listing'}`
    : `Price change not approved: ${listing.business_name || 'your listing'}`
  const bodyText = action === 'approve'
    ? `Your requested asking price of $${Number(pending.asking_price).toLocaleString()} has been approved and is now live.`
    : `Your requested price change was not approved.${notes ? ` Reviewer note: ${notes}` : ''}`
  if (listing.agency_id) {
    await createNotification({ agency_id: listing.agency_id, title, body: bodyText, kind: action === 'approve' ? 'success' : 'info' }).catch(() => {})
  }
  if (listing.owner_email) {
    await sendEmail({
      to: listing.owner_email,
      subject: title,
      html: `<h2 style="margin:0 0 12px;font-family:Georgia,serif;">${title}</h2><p>${bodyText}</p><p style="margin-top:18px;font-size:13px;color:#888;">— Your Concord broker</p>`,
      kind: 'generic',
    }).catch(() => {})
  }

  // Best-effort ripple to matched buyers/watchlists on approval — reuse the
  // existing watchlist matcher rather than building new plumbing.
  if (action === 'approve') {
    try {
      const { runWatchlistMatching } = await import('@/lib/watchlist')
      await runWatchlistMatching(id).catch(() => {})
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    ok: true,
    action,
    asking_price: action === 'approve' ? pending.asking_price : listing.asking_price,
  })
}
