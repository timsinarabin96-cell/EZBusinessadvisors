/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// POST /api/auth/reset-password
// -----------------------------------------------------------------------------
// Sets a new password using the recovery token supplied by Supabase's
// reset-password email. The client sends the recovery token from the URL hash
// (e.g. /auth/reset-password#access_token=...&type=recovery) plus the new
// password. We exchange the token for a session server-side and update the
// password via `updateUser`, then clear the in-flight session.
//
// This is intentionally done server-side with the service-role client so the
// token never needs to be shared with the anon client on a fragile flow.
// =============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

export async function POST(req: Request) {
  // Brute-force protection: 10 password-reset attempts per IP per 10 minutes.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 10 * 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  let token = ''
  let password = ''
  try {
    const body = await req.json()
    token = typeof body?.token === 'string' ? body.token : ''
    password = typeof body?.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing or expired recovery link. Please request a new one.' }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ ok: false, error: 'A new password is required.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  try {
    const admin = createServerClient()
    if (!admin) {
      return NextResponse.json(
        { ok: false, error: 'Password reset is not configured on this environment yet.' },
        { status: 503 },
      )
    }

    // Exchange the recovery token for an authenticated session.
    const { data, error: sessionError } = await admin.auth.getUser(token)
    if (sessionError || !data?.user) {
      console.log(`[auth] reset-password token exchange failed: ${sessionError?.message || 'no user'}`)
      return NextResponse.json(
        { ok: false, error: 'This reset link is invalid or has expired. Please request a new one.' },
        { status: 401 },
      )
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, {
      password,
    })
    if (updateError) {
      console.log(`[auth] reset-password update failed: ${updateError.message}`)
      return NextResponse.json(
        { ok: false, error: 'Could not update your password. Please try again.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, email: data.user.email }, { status: 200 })
  } catch (err) {
    console.log('[auth] reset-password unexpected error:', err)
    return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
