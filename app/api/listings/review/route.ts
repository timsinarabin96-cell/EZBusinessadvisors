/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageListing, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { runWatchlistMatching } from '@/lib/watchlist'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

/**
 * POST /api/listings/review
 * body: { listingId, action: 'approve' | 'reject' | 'request_changes', notes?, commissionSplitAgent? }
 *
 * Broker review workflow for draft listings (incl. seller self-service orders):
 *  - approve     → status 'approved', compliance 'approved', stamps reviewer.
 *                  (auto-match trigger fires buyer matching automatically.)
 *  - reject      → status 'rejected'.
 *  - request_changes → status 'draft', review_stage 'changes_requested'.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }
  const { listingId, action, notes, commissionSplitAgent } = (body || {}) as {
    listingId?: string
    action?: string
    notes?: string
    commissionSplitAgent?: number | null
  }
  if (!listingId || !['approve', 'reject', 'request_changes'].includes(action || '')) {
    return NextResponse.json({ ok: false, error: 'listingId and a valid action are required' }, { status: 400 })
  }

  const { data: listing } = await db.from('listings').select('id, agency_id, agent_id, status, business_name, owner_email').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'listing not found' }, { status: 404 })
  // Brokers (not just owner/admin) review and approve their agency's listings.
  if (!canManageListing(authenticated, { agency_id: listing.agency_id, agent_id: listing.agent_id ?? null })) return forbiddenResponse()

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (action === 'approve') {
    patch.status = 'approved'
    patch.review_stage = 'approved'
    patch.compliance_status = 'approved'
    patch.approved_by = authenticated.user.id
    patch.approved_at = new Date().toISOString()
    if (commissionSplitAgent != null) patch.commission_split_agent = commissionSplitAgent
  } else if (action === 'reject') {
    patch.status = 'rejected'
    patch.review_stage = 'rejected'
    patch.compliance_status = 'rejected'
  } else {
    patch.status = 'draft'
    patch.review_stage = 'changes_requested'
  }

  const { error } = await db.from('listings').update(patch).eq('id', listingId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Fire buyer watchlist/alerts the moment a listing goes live.
  if (action === 'approve') {
    runWatchlistMatching(listingId).catch(() => {})
  }

  // Record the review event (audit trail).
  await db.from('listing_review_events').insert({
    agency_id: listing.agency_id,
    listing_id: listingId,
    actor_id: authenticated.user.id,
    from_stage: listing.status || 'draft',
    to_stage: patch.review_stage as string,
    notes: notes || null,
  }).maybeSingle()

  // Notify the SELLER of their listing's review outcome — they submitted it
  // through the public form and deserve to know what happens next.
  const sellerEmail = (listing as { owner_email?: string | null }).owner_email || null
  if (sellerEmail) {
    const statusLine =
      action === 'approve'
        ? 'Your listing has been approved by our review team — it will go live shortly.'
        : action === 'reject'
          ? 'Unfortunately your listing was not approved. Our team will reach out to explain why and what can be improved.'
          : 'Our team requested a few changes to your listing before it can go live. Check your email / portal for details, or contact your broker.'
    const subject =
      action === 'approve'
        ? `✅ Approved: ${listing.business_name || 'your listing'}`
        : action === 'reject'
          ? `ℹ️ Update: ${listing.business_name || 'your listing'}`
          : `✏️ Action needed: ${listing.business_name || 'your listing'}`
    await sendEmail({
      to: sellerEmail,
      subject,
      html: `<h2 style="margin:0 0 12px;font-family:Georgia,serif;">${subject}</h2><p>${statusLine}</p>${notes ? `<p style="color:#555;">Reviewer note: ${notes}</p>` : ''}<p style="margin-top:18px;font-size:13px;color:#888;">— Your Concord broker</p>`,
      kind: 'generic',
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, action, listing_id: listingId })
}
