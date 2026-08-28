/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { normalizePhone, otpMatches, OTP_MAX_ATTEMPTS } from '@/lib/phoneVerify'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/verify/phone/confirm  body: { phone, code }
// Validates the OTP (timing-safe), marks profiles.phone + phone_verified_at,
// and stamps profile_completed_at once phone verification succeeds.
// =============================================================================

export async function POST(req: NextRequest) {
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  const auth = await authenticateRequest(req)
  if (!auth?.user) return unauthorizedResponse('Sign in required')
  const user = auth.user

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }
  const phone = normalizePhone(String(body?.phone || ''))
  const code = String(body?.code || '').trim()
  if (!phone || !code) return NextResponse.json({ ok: false, error: 'Phone and code are required.' }, { status: 400 })

  const { data: rows } = await svc
    .from('phone_verifications')
    .select('id, code_hash, attempts, expires_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
  const row = (rows || [])[0]
  if (!row) return NextResponse.json({ ok: false, error: 'No code found for this number — request a new one.' }, { status: 400 })

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: 'Code expired — request a new one.' }, { status: 400 })
  }
  if ((row.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ ok: false, error: 'Too many failed attempts — request a new code.' }, { status: 429 })
  }

  if (!otpMatches(phone, code, row.code_hash)) {
    await svc.from('phone_verifications').update({ attempts: (row.attempts || 0) + 1 }).eq('id', row.id)
    return NextResponse.json({ ok: false, error: 'Incorrect code. Please try again.' }, { status: 400 })
  }

  // Success: record verification on the profile, clean up used codes.
  const { error: profErr } = await svc
    .from('profiles')
    .update({ phone, phone_verified_at: new Date().toISOString(), profile_completed_at: new Date().toISOString() })
    .eq('id', user.id)
  if (profErr) return NextResponse.json({ ok: false, error: profErr.message }, { status: 500 })
  await svc.from('phone_verifications').delete().eq('phone', phone)

  return NextResponse.json({ ok: true, phoneVerified: true, message: 'Phone verified. Your listing is now eligible for activation.' })
}
