/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { flushEmailQueue, countStuckQueued } from '@/lib/emailQueue'

export const runtime = 'nodejs'

/**
 * POST /api/cron/flush-email-queue — re-attempt delivery of queued emails.
 * Fires after the weekly digest (and on demand) so a provider blip or a
 * config gap never leaves mail silently stuck. Protected by x-cron-secret.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('x-cron-secret') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (secret && auth !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const limit = Number(req.headers.get('x-flush-limit') || 25)
  const { flushed, failed } = await flushEmailQueue(limit)
  const remaining = await countStuckQueued()

  return NextResponse.json({ ok: true, flushed, failed, remaining })
}
