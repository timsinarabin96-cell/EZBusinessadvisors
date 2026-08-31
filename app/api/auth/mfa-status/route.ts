/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { mfaRequirementFor } from '@/lib/mfaPolicy'

export const runtime = 'nodejs'

/**
 * GET /api/auth/mfa-status — for the CURRENT session: is MFA required for
 * this account (super_admin, or a member of an agency with require_2fa=true),
 * and does the account have a verified TOTP factor enrolled?
 *
 * The login flow calls this right after password auth. When required && !enrolled
 * the user is BLOCKED from the portal and forced through TOTP enrollment —
 * there is no path to the dashboard without a verified factor.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const requirement = await mfaRequirementFor(auth.user.id)
  return NextResponse.json({ ok: true, ...requirement })
}
