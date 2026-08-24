import { NextRequest, NextResponse } from 'next/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { sendPushToProfile } from '@/lib/webPush'

export const runtime = 'nodejs'

/**
 * POST /api/push/send — send a web push to a profile (self or admin).
 * body: { profileId?, title, body?, link? }
 * Used by the settings "test push" button and by notification workflows.
 */
export async function POST(req: NextRequest) {
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const { profileId, title, body: bodyText, link } = body as {
    profileId?: string
    title?: string
    body?: string
    link?: string
  }

  const target = profileId && profileId !== authenticated.user.id ? profileId : authenticated.user.id
  if (!title) return NextResponse.json({ ok: false, error: 'title is required' }, { status: 400 })

  const result = await sendPushToProfile(target, { title, body: bodyText, link })
  if (!result.ok && result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, sent: result.sent })
}
