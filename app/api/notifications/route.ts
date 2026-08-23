import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { listNotifications, markRead, unreadCount } from '@/lib/notifications'

export const runtime = 'nodejs'

/**
 * GET  /api/notifications?agencyId=...&unread=1 — list (or unread count)
 * PATCH /api/notifications { notificationId? } — mark read (all if omitted)
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  if (req.nextUrl.searchParams.get('unread') === '1') {
    const count = await unreadCount(agencyId, auth.user.id)
    return NextResponse.json({ ok: true, count })
  }

  const items = await listNotifications(agencyId, auth.user.id)
  return NextResponse.json({ ok: true, items })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const result = await markRead(body.notificationId || undefined, auth.user.id)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
