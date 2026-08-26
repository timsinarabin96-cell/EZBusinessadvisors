/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { sanitizeBuyerProfilePatch } from '@/lib/buyerProfileCore'

export const runtime = 'nodejs'

/**
 * /api/buyer/profile — self-service buyer search profile.
 *
 * GET   — fetch the signed-in buyer's search profile; auto-creates one
 *         (linked to their profile_id) the first time so buyers can
 *         immediately start getting matches.
 * PATCH — update criteria: industries, locations, price/revenue/SDE bands,
 *         financing, notification prefs, AI-match toggle.
 *
 * The match engine (lib/buyerMatching) reads these profiles to score
 * listings, so this is the buyer-side half of the engine's input.
 */

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { data: existing } = await db
    .from('buyer_search_profiles')
    .select('*')
    .eq('profile_id', auth.user.id)
    .maybeSingle()

  if (existing) return NextResponse.json({ ok: true, profile: existing })

  // Auto-provision: first visit → create the buyer's profile so the match
  // engine can start scoring listings against their (empty) criteria.
  const { data: nameRow } = await db.from('profiles').select('full_name').eq('id', auth.user.id).maybeSingle()
  const { data: created, error } = await db
    .from('buyer_search_profiles')
    .insert({
      profile_id: auth.user.id,
      email: auth.user.email || '',
      name: (nameRow as { full_name?: string | null } | null)?.full_name || null,
      industries: [],
      locations: [],
      financing_methods: [],
      notification_email: true,
      notification_sms: false,
      notification_frequency: 'instant',
      ai_match_enabled: true,
      active: true,
    })
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, profile: created, created: true })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const patch = sanitizeBuyerProfilePatch(body)
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updated, error } = await db
    .from('buyer_search_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('profile_id', auth.user.id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!updated) {
    // No row yet (edge case: PATCH before first GET) → create it with the patch.
    const { data: nameRow } = await db.from('profiles').select('full_name').eq('id', auth.user.id).maybeSingle()
    const { data: created, error: createError } = await db
      .from('buyer_search_profiles')
      .insert({
        profile_id: auth.user.id,
        email: auth.user.email || '',
        name: typeof patch.name === 'string' ? patch.name : (nameRow as { full_name?: string | null } | null)?.full_name || null,
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle()
    if (createError) return NextResponse.json({ ok: false, error: createError.message }, { status: 500 })
    return NextResponse.json({ ok: true, profile: created, created: true })
  }

  return NextResponse.json({ ok: true, profile: updated })
}
