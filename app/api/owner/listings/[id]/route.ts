/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

// =============================================================================
// PATCH /api/owner/listings/[id] — seller self-service EDIT of safe public
// fields only (description, headline, industry/sub_industry, location,
// highlights, images). Money/financials/status/review fields are HARD
// LOCKED — never accepted here, even if present in the request body.
//
// Owner auth mirrors the status/financials routes: listing.owner_email must
// match the signed-in user's email, or a seller_listing_orders row links the
// user's email to the listing.
//
// If a field that affects marketplace trust (business_name, industry,
// sub_industry, location_general) changes on a listing that is currently
// live (status active/approved), we send it back to review_stage
// 'changes_requested' + status 'draft' so a broker re-checks it before it's
// visible again — same states the existing review flow already understands
// (see app/api/listings/review/route.ts + app/dashboard/review-queue).
// =============================================================================

const EDITABLE_FIELDS = [
  'business_name',
  'headline',
  'industry',
  'sub_industry',
  'location_general',
  'description',
  'public_highlights',
  'reason_for_sale',
  'growth_opportunities',
  'competitive_advantages',
  'image_urls',
] as const
type EditableField = (typeof EDITABLE_FIELDS)[number]

// Fields the owner must NEVER be able to touch through this route, even if
// sent — money, financials, status/review, and agency/agent assignment.
const LOCKED_FIELDS = [
  'asking_price',
  'annual_revenue',
  'sde',
  'ebitda',
  'revenue_year_1',
  'revenue_year_2',
  'revenue_year_3',
  'financials_status',
  'status',
  'review_stage',
  'compliance_status',
  'agency_id',
  'agent_id',
  'owner_email',
  'legitimacy_verdict',
  'legitimacy_score',
]

// Re-review is required if any of these public-trust fields changed and the
// listing is currently visible to buyers.
const RETRIGGERS_REVIEW = new Set(['business_name', 'industry', 'sub_industry', 'location_general'])
const LIVE_STATUSES = new Set(['active', 'approved', 'published'])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  const auth = await authenticateRequest(req)
  if (!auth?.user?.id) return unauthorizedResponse('Sign in required')
  const user = auth.user

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  // Reject outright if the caller tries to smuggle a locked field in — fail
  // closed rather than silently drop, so a buggy client finds out fast.
  const attemptedLocked = LOCKED_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(body, f))
  if (attemptedLocked.length > 0) {
    return NextResponse.json(
      { ok: false, error: `These fields cannot be changed here: ${attemptedLocked.join(', ')}. Price changes go through /price; financials/status have their own flows.` },
      { status: 400 },
    )
  }

  const { data: listing } = await svc
    .from('listings')
    .select('id, owner_email, status, review_stage, business_name, industry, sub_industry, location_general, description, public_highlights, headline, reason_for_sale, growth_opportunities, competitive_advantages, image_urls, agency_id')
    .eq('id', id)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const ownsListing =
    listing.owner_email === user.email ||
    (await svc
      .from('seller_listing_orders')
      .select('id')
      .eq('listing_id', id)
      .eq('seller_email', user.email)
      .maybeSingle()
      .then((r) => Boolean(r.data)))
  if (!ownsListing) {
    return NextResponse.json({ ok: false, error: 'You do not own this listing' }, { status: 403 })
  }

  const patch: Record<string, unknown> = {}
  const changed: Record<string, { from: unknown; to: unknown }> = {}
  for (const field of EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue
    const value = body[field as EditableField]
    if (field === 'image_urls') {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        return NextResponse.json({ ok: false, error: 'image_urls must be an array of strings' }, { status: 400 })
      }
    } else if (value != null && typeof value !== 'string') {
      return NextResponse.json({ ok: false, error: `${field} must be a string` }, { status: 400 })
    }
    const prev = (listing as Record<string, unknown>)[field]
    const same = field === 'image_urls' ? JSON.stringify(prev || []) === JSON.stringify(value || []) : (prev || null) === (value ?? null)
    if (!same) {
      patch[field] = value
      changed[field] = { from: prev ?? null, to: value ?? null }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, message: 'No changes.', changed: [] })
  }

  const needsReReview = Object.keys(changed).some((f) => RETRIGGERS_REVIEW.has(f)) && LIVE_STATUSES.has(listing.status || '')
  if (needsReReview) {
    patch.status = 'draft'
    patch.review_stage = 'changes_requested'
  }
  patch.updated_at = new Date().toISOString()

  const { error } = await svc.from('listings').update(patch).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Audit trail — every owner edit, with a changed-fields diff.
  try {
    const { recordAdminAudit } = await import('@/lib/adminAudit')
    await recordAdminAudit({
      actorId: user.id,
      actorEmail: user.email || null,
      action: 'owner_edited_listing',
      targetType: 'listing',
      targetId: id,
      targetLabel: listing.business_name || null,
      details: { changed, re_review_triggered: needsReReview },
    })
  } catch { /* audit is best-effort */ }

  return NextResponse.json({
    ok: true,
    changed: Object.keys(changed),
    reReviewTriggered: needsReReview,
    message: needsReReview
      ? 'Saved. Because your business name/industry/location changed, your listing goes back to broker review before it shows live again.'
      : 'Listing updated.',
  })
}
