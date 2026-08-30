/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, unauthorizedResponse, forbiddenResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 16 * 1024

// ---------------------------------------------------------------------------
// GET/PUT /api/agency/signing
// The agency's stored signing identity — used by the buyer-NDA auto
// counter-sign flow (app/api/public/nda/sign/route.ts reads
// agencies.signing_name/signing_title to counter-sign buyer NDAs).
// Owner/admins of the agency can read + update their own identity.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId')
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const { data, error } = await db
    .from('agencies')
    .select('id, name, signing_name, signing_title, signing_signature')
    .eq('id', agencyId)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, signing: data || null })
}

export async function PUT(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const raw = await req.text().catch(() => '')
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Invalid or oversized body' }, { status: 400 })
  }

  let body: any = {}
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const agencyId = body.agencyId
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const patch: Record<string, unknown> = {}
  if (typeof body.signingName === 'string') patch.signing_name = body.signingName.trim().slice(0, 200) || null
  if (typeof body.signingTitle === 'string') patch.signing_title = body.signingTitle.trim().slice(0, 200) || null
  if (typeof body.signingSignature === 'string') patch.signing_signature = body.signingSignature.trim().slice(0, 2000) || null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await db.from('agencies').update(patch).eq('id', agencyId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
