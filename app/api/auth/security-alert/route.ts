/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { notify } from '@/lib/email'
import { sendHighAlert } from '@/lib/highAlerts'
import { rateLimitAsync, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/auth/security-alert — account-change security emails.
// Body: { type: 'email_changed', newEmail? } | { type: 'new_sign_in' }
//
// The client fires this AFTER a successful email change or sign-in. The server
// resolves the user from the session (never trusts client identity), captures
// the real IP + time, and emails the owner:
//   - password_changed  → sent from the reset-password route (server-side)
//   - email_changed     → sent here, to the OLD address when available
//   - new_sign_in       → sent here, to the account address
// Rate-limited so an attacker can't spam the owner's inbox.
// =============================================================================

export async function POST(req: NextRequest) {
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60_000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user?.email) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const type = String(body?.type || '')
  const ip = clientIp(req)
  const at = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  const meta = { ip: ip === 'unknown' ? undefined : ip, at }

  if (type === 'email_changed') {
    // Alert goes to the OLD address if the caller provided it (they just
    // changed away from it) — otherwise fall back to the session address.
    const to = String(body?.oldEmail || '').trim() || auth.user.email
    await notify('email_changed', to, { ...meta, newEmail: String(body?.newEmail || auth.user.email) }).catch(() => {})
    return NextResponse.json({ ok: true, type })
  }

  if (type === 'new_sign_in') {
    const result = await notify('new_sign_in', auth.user.email, meta).catch(() => ({ ok: false, queued: false }))
    if (body?.anomaly === true || !result.ok) {
      await sendHighAlert({
        summary: body?.anomaly === true ? 'Suspicious sign-in detected' : 'Security notification delivery failed',
        details: `Account: ${auth.user.email}; IP: ${meta.ip || 'unknown'}; time: ${at}`,
        meta: { source: 'security-alert', account: auth.user.email, ip: meta.ip, anomaly: body?.anomaly === true },
      }).catch(() => {})
    }
    return NextResponse.json({ ok: true, type })
  }

  return NextResponse.json({ ok: false, error: 'type must be email_changed or new_sign_in' }, { status: 400 })
}
