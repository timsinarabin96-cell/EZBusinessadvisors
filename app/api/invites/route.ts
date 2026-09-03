/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageTeam, unauthorizedResponse } from '@/lib/supabase/auth'
import { createInviteToken } from '@/lib/invites'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

/**
 * POST /api/invites
 *   { targetType: 'professional' | 'broker', email?, agencyId? }
 * Creates an invite token the broker can paste into a link (or email directly).
 * Returns { token, url } where url is the self-onboarding page.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const targetType = String(body?.targetType || 'professional')
  if (targetType !== 'professional' && targetType !== 'broker' && targetType !== 'agent') {
    return NextResponse.json({ ok: false, error: 'targetType must be professional, broker, or agent' }, { status: 400 })
  }
  const agencyId = String(body?.agencyId || auth.memberships?.[0]?.agency_id || '').trim() || null
  if (agencyId && !canManageTeam(auth, agencyId)) {
    return NextResponse.json({ ok: false, error: 'Not allowed for this agency' }, { status: 403 })
  }
  const email = String(body?.email || '').trim() || null

  // Seat-limit gate at INVITE CREATION too (2026-09-01 usage overhaul, same
  // enforcement as the fill path — no exceptions): an agency at its agent-seat
  // limit can't even send new agent invites. Professional/broker invites
  // create network profiles (deal_professionals/broker_profiles), not seats,
  // so only agent invites consume the agency's seat allowance here.
  if (targetType === 'agent' && agencyId) {
    const { usageBlock } = await import('@/lib/usageEnforcement')
    const blocked = await usageBlock(agencyId, 'agents')
    if (blocked) {
      return NextResponse.json({ ok: false, error: blocked.error, code: 'USAGE_LIMIT', upgradeUrl: blocked.upgradeUrl }, { status: 429 })
    }
  }

  // Resolve agency name for the invite email (agent invites say who invited you).
  let agencyName = 'the team'
  if (agencyId) {
    const { data: ag } = await db.from('agencies').select('name').eq('id', agencyId).maybeSingle()
    if (ag?.name) agencyName = ag.name
  }

  const invite = await createInviteToken({
    target_type: targetType,
    agency_id: agencyId,
    email,
    created_by: auth.user.id,
    expires_in_days: 30,
  })
  if (!invite) return NextResponse.json({ ok: false, error: 'Failed to create invite' }, { status: 500 })

  const origin = req.headers.get('origin') || 'https://concorddeal.com'
  const url = `${origin}/invite/${invite.token}`

  // Optional: email the invite directly.
  if (email) {
    const label = targetType === 'broker' ? 'broker profile' : targetType === 'agent' ? 'your agent account' : 'professional profile'
    const heading = targetType === 'agent' ? 'Your broker invited you to the team' : "You're invited to join our directory"
    const body = targetType === 'agent'
      ? `<h2>${heading}</h2><p><strong>${(auth.profile as any).full_name || 'Your broker'}</strong> invited you to join <strong>${agencyName}</strong> on Concord.</p><p>Create your own login (email + password) — you'll get access to the team CRM and your own listings.</p><p><a href="${url}" style="display:inline-block;padding:12px 22px;background:#0e7490;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Accept invitation →</a></p><p style="font-size:12px;color:#888;">This link is unique to you and expires in 30 days.</p>`
      : `<h2>${heading}</h2><p>Fill in your ${label} (takes 2 minutes — add your photo, contact info, and specialties) and you'll appear in our public network where buyers and brokers can reach you directly.</p><p><a href="${url}" style="display:inline-block;padding:12px 22px;background:#0e7490;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Accept invitation →</a></p><p style="font-size:12px;color:#888;">You can unsubscribe yourself anytime from your profile.</p>`
    await sendEmail({
      to: email,
      subject: targetType === 'agent' ? `You're invited to join ${agencyName} on Concord` : "You're invited to join our directory",
      html: body,
      kind: 'generic',
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, token: invite.token, url })
}
