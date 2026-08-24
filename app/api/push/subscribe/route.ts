import { NextRequest, NextResponse } from 'next/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { savePushSubscription, removePushSubscription } from '@/lib/webPush'

export const runtime = 'nodejs'

/**
 * POST /api/push/subscribe — save a browser push subscription for the caller.
 * body: { endpoint, keys: { p256dh, auth } }
 * DELETE /api/push/unsubscribe — remove a subscription by endpoint.
 */
export async function POST(req: NextRequest) {
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const { endpoint, keys } = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ ok: false, error: 'endpoint and keys are required' }, { status: 400 })
  }

  const agencyId = authenticated.memberships?.[0]?.agency_id || null
  const result = await savePushSubscription({
    profile_id: authenticated.user.id,
    agency_id: agencyId,
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    user_agent: req.headers.get('user-agent'),
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const { searchParams } = new URL(req.url)
  const endpoint = searchParams.get('endpoint') || ''
  if (!endpoint) return NextResponse.json({ ok: false, error: 'endpoint required' }, { status: 400 })

  const result = await removePushSubscription(endpoint)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
