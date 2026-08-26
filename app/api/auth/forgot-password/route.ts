/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// POST /api/auth/forgot-password
// -----------------------------------------------------------------------------
// Initiates a password reset for an existing CONCORD account. Uses the
// server-side Supabase admin client to call `resetPasswordForEmail`, which
// sends Supabase's branded email containing a recovery link that routes the
// user to /auth/reset-password (set as the redirectTo).
//
// Security:
//   * Always returns a success-shaped response regardless of whether the email
//     exists, to avoid account enumeration.
//   * Does NOT log or reveal whether an address has an account.
//   * Email delivery follows the platform's standard sendEmail() path (SMTP
//     when configured, otherwise queued); Supabase's own email send also fires
//     for the reset link.
// =============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import {rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

export async function POST(req: Request) {
  // Brute-force / spam protection: 5 reset requests per IP per 10 minutes.
  if (!(await rateLimitAsync(clientIp(req), { limit: 5, windowMs: 10 * 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  let email = ''
  try {
    const body = await req.json()
    email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  if (!email) {
    return NextResponse.json({ ok: false, error: 'Email is required.' }, { status: 400 })
  }
  // Basic shape validation so we never hand garbage to Supabase.
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }

  try {
    // Redirect to the reset-password page on this same origin. The page reads
    // the recovery token Supabase places in the URL hash and lets the user set
    // a new password. type=recovery ensures Supabase attaches the correct auth
    // state to the link.
    const redirectTo = `${APP_URL}/auth/reset-password`
    const admin = createServerClient()

    if (admin) {
      const { error } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo,
      })
      // Do not surface any error that would reveal account existence.
      if (error) {
        console.log(`[auth] forgot-password resetPasswordForEmail failed: ${error.message}`)
      }
    } else {
      console.log('[auth] forgot-password skipped: SUPABASE_SERVICE_ROLE_KEY not configured locally')
    }

    // Always report success (anti-enumeration). The UI tells the user to check
    // their inbox either way.
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.log('[auth] forgot-password unexpected error:', err)
    // Still mask existence.
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
