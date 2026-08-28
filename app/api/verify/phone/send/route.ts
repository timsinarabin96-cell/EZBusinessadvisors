/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { rateLimitAsync } from '@/lib/rateLimit'
import { normalizePhone, generateOtp, hashOtp, sendOtpSms, OTP_TTL_MS } from '@/lib/phoneVerify'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/verify/phone/send  body: { phone }
// Sends an SMS OTP to the signed-in user's phone. Rate-limited per phone.
// Codes are stored as salted hashes only (service-role table, no client RLS).
// In non-production environments without Twilio, returns a dev code so the
// flow stays testable end-to-end.
// =============================================================================

const clientIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'

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
  if (!phone) return NextResponse.json({ ok: false, error: 'Enter a valid phone number (10–15 digits).' }, { status: 400 })

  // Rate limit: 3 sends per phone per 10 minutes.
  const rlKey = `phone-otp-${phone}`
  const rl = await rateLimitAsync(rlKey, { limit: 3, windowMs: 10 * 60 * 1000 }).catch(() => true)
  if (rl === false) {
    return NextResponse.json({ ok: false, error: 'Too many codes sent to this number. Try again in 10 minutes.' }, { status: 429 })
  }

  const code = generateOtp()
  const { error: insertErr } = await svc.from('phone_verifications').insert({
    phone,
    code_hash: hashOtp(phone, code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  })
  if (insertErr) return NextResponse.json({ ok: false, error: 'Could not create verification. Please retry.' }, { status: 500 })

  const sent = await sendOtpSms(phone, code)

  // Non-prod fallback: surface the code so the flow can be tested without SMS.
  const isProd = process.env.VERCEL_ENV === 'production'
  if (!sent.ok && !isProd) {
    return NextResponse.json({ ok: true, devCode: code, note: 'SMS not configured in this environment — dev code returned.' })
  }
  if (!sent.ok) {
    return NextResponse.json({ ok: false, error: `Could not send SMS: ${sent.error || 'unknown'}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true, message: 'Verification code sent by text.' })
}
