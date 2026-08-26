/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * POST /api/invites/[token]/status
 *   { active: boolean }
 * Self-service subscribe/unsubscribe for the invitee's directory row.
 * No auth required — the token IS the proof of ownership.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { token } = await params
  const tokenValue = String(token || '')
  const { data: invite } = await db.from('invite_tokens').select('*').eq('token', tokenValue).maybeSingle()
  if (!invite || !invite.target_id) return NextResponse.json({ ok: false, error: 'Invite not found' }, { status: 404 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }
  const active = body?.active !== false

  try {
    if (invite.target_type === 'professional') {
      const { error } = await db.from('deal_professionals').update({ is_active: active }).eq('id', invite.target_id)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    } else {
      const { error } = await db.from('broker_profiles').update({ is_public: active, profile_status: active ? 'active' : 'hidden' }).eq('id', invite.target_id)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, active })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Update failed' }, { status: 500 })
  }
}
