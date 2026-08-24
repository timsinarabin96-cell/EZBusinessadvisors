import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, unauthorizedResponse } from '@/lib/supabase/auth'
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
  if (targetType !== 'professional' && targetType !== 'broker') {
    return NextResponse.json({ ok: false, error: 'targetType must be professional or broker' }, { status: 400 })
  }
  const agencyId = String(body?.agencyId || auth.memberships?.[0]?.agency_id || '').trim() || null
  if (agencyId && !canManageAgency(auth, agencyId)) {
    return NextResponse.json({ ok: false, error: 'Not allowed for this agency' }, { status: 403 })
  }
  const email = String(body?.email || '').trim() || null

  const invite = await createInviteToken({
    target_type: targetType,
    agency_id: agencyId,
    email,
    created_by: auth.user.id,
    expires_in_days: 30,
  })
  if (!invite) return NextResponse.json({ ok: false, error: 'Failed to create invite' }, { status: 500 })

  const origin = req.headers.get('origin') || 'https://concord-deal-platform.vercel.app'
  const url = `${origin}/invite/${invite.token}`

  // Optional: email the invite directly.
  if (email) {
    const label = targetType === 'broker' ? 'broker profile' : 'professional profile'
    await sendEmail({
      to: email,
      subject: `You're invited to join our directory`,
      html: `<h2>You're invited 🎉</h2><p>Fill in your ${label} (takes 2 minutes — add your photo, contact info, and specialties) and you'll appear in our public network where buyers and brokers can reach you directly.</p><p><a href="${url}" style="display:inline-block;padding:12px 22px;background:#0e7490;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Accept invitation →</a></p><p style="font-size:12px;color:#888;">You can unsubscribe yourself anytime from your profile.</p>`,
      kind: 'generic',
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, token: invite.token, url })
}
