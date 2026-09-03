/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * GET /api/referrals/stats
 * Referral tracker for the logged-in user: invite links they created, how many
 * filled (self-onboarded), and their shareable referral URL.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { data: invites } = await db
    .from('invite_tokens')
    .select('id, token, target_type, status, created_at, filled_at, email')
    .eq('created_by', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const sent = (invites || []).length
  const filled = (invites || []).filter((i) => i.status === 'filled').length
  const origin = req.headers.get('origin') || 'https://concorddeal.com'

  return NextResponse.json({
    ok: true,
    sent,
    filled,
    pending: sent - filled,
    referralUrl: `${origin}/join?ref=${auth.user.id}`,
    invites: (invites || []).map((i) => ({
      id: i.id,
      type: i.target_type,
      status: i.status,
      email: i.email,
      createdAt: i.created_at,
      filledAt: i.filled_at,
    })),
  })
}
