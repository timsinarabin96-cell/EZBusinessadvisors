/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { finalizeVersion } from '@/lib/workflow'
import { validationErrorJson } from '@/lib/friendlyValidation'

// =============================================================================
// POST /api/financial/bov/finalize — AGENT REVIEW + APPROVE (liability gate).
// -----------------------------------------------------------------------------
// Body: { "versionId": "uuid" }
//
// The ONE action that may title a document "Broker Opinion of Value". The
// caller must be a signed-in member of the listing's agency. On success the
// version flips to status='final' and records reviewed_by + reviewed_at —
// finalizeVersion() refuses to flip without a reviewer (hard invariant).
// Everything that never passes through here stays "AI Valuation Estimate",
// including ALL self-serve paid-tier output (paid tier ≠ agent-reviewed).
// =============================================================================

const finalizeSchema = z.object({
  versionId: z.string().uuid(),
})

function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req)
  const supabase = createServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Server client not configured.' }, { status: 500 })
  if (!token) return NextResponse.json({ ok: false, error: 'Missing authorization header.' }, { status: 401 })

  const { data: user, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user?.user) return NextResponse.json({ ok: false, error: 'Invalid or expired session.' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = finalizeSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationErrorJson(parsed.error), { status: 422 })
  const { versionId } = parsed.data

  // Agency gate: the reviewer must belong to the listing's agency.
  try {
    const { data: version } = await supabase.from('bov_versions').select('listing_id').eq('id', versionId).maybeSingle()
    const listingId = (version as { listing_id?: string | null } | null)?.listing_id
    if (!listingId) return NextResponse.json({ ok: false, error: 'Version not found' }, { status: 404 })
    const { data: listing } = await supabase.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
    const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
    if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
    const { data: memberships } = await supabase.from('agency_members').select('agency_id').eq('profile_id', user.user.id)
    const mine = new Set((memberships || []).map((m) => m.agency_id))
    if (!mine.has(agencyId)) {
      return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency — only a licensed agent may sign off a BOV.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Agency check failed' }, { status: 500 })
  }

  const ok = await finalizeVersion('bov_versions', versionId, 'final', { reviewerId: user.user.id, db: supabase })
  if (!ok) {
    return NextResponse.json({ ok: false, error: 'Finalize failed — the version must carry a named reviewer (reviewed_by/reviewed_at).' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, status: 'final' })
}
