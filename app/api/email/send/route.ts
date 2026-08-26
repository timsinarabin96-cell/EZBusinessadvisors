/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { sendEmail, notify, emailTemplates, type EmailKind } from '@/lib/email'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * POST /api/email/send
 *
 * Send a notification email. Accepts either a fully-formed email
 * ({ to, subject, html, kind, meta }) or a template call
 * ({ to, kind, payload }).
 *
 * AUTH: broker/admin session required — this is a mail relay, not a
 * public endpoint (previously unauthenticated, could be abused for spam).
 */
export async function POST(req: NextRequest) {
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  try {
    const body = await req.json()
    const to: string = body?.to
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return NextResponse.json({ ok: false, error: 'A valid recipient email is required' }, { status: 400 })
    }

    // Option B: template-driven send.
    if (body.kind) {
      const kind = body.kind as EmailKind
      const result = await notify(kind, to, body.payload || {})
      return NextResponse.json({ ok: result.ok, queued: result.queued, reason: result.reason })
    }

    // Option A: direct html.
    if (!body.subject || !body.html) {
      return NextResponse.json({ ok: false, error: 'subject and html (or a template kind) are required' }, { status: 400 })
    }
    const result = await sendEmail({
      to,
      subject: body.subject,
      html: body.html,
      kind: body.kind as EmailKind | undefined,
      meta: body.meta,
    })
    return NextResponse.json({ ok: result.ok, queued: result.queued, reason: result.reason })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Failed to send email' }, { status: 500 })
  }
}

/** GET /api/email/send?preview=<kind> — returns a rendered template for preview. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const inputKind = (url.searchParams.get('preview') || 'generic') as EmailKind
  // emailTemplates uses camelCase keys; kinds use snake_case.
  const camel =
    inputKind
      .split('_')
      .map((seg, i) => (i === 0 ? seg : seg[0]?.toUpperCase() + seg.slice(1)))
      .join('')
  const t = (emailTemplates as any)[camel]
  if (!t || typeof t !== 'function') {
    return NextResponse.json({ ok: false, error: 'Unknown template kind' }, { status: 400 })
  }
  const built = t({})
  const html = built ? built.html : ''
  return new NextResponse(`<!DOCTYPE html><html><body style="margin:0"><iframe src="about:blank" style="width:0;height:0;border:0"/><div style="max-width:640px;margin:20px auto;border:1px solid #eee">${html}</div></body></html>`, {
    headers: { 'Content-Type': 'text/html' },
  })
}
