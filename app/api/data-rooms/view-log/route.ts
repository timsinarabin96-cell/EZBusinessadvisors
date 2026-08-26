/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logRoomFileIntent } from '@/lib/dataRoomIntent'
import {rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

/**
 * POST /api/data-rooms/view-log
 * body: { fileId, viewerEmail, action: 'view' | 'download' }
 * Fire-and-forget from buyer-facing surfaces (portal, share links, future
 * room browsers). No auth required — the payload only records an anonymous
 * view count keyed by email; the file must exist and repeats within 60s per
 * email+file are deduped. Never returns buyer data.
 */
export async function POST(req: NextRequest) {
  // Anti-abuse: public write endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 20, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const body = await req.json().catch(() => ({}))
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = req.headers.get('user-agent') || null

  const action = body.action === 'download' ? 'download' : 'view'
  const result = await logRoomFileIntent({
    fileId: String(body.fileId || ''),
    viewerEmail: String(body.viewerEmail || ''),
    action,
    ip,
    userAgent,
  })

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, skipped: Boolean(result.skipped) })
}
