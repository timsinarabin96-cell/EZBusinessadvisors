/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'

import { processScheduledPublishes } from '@/lib/publish'

export const runtime = 'nodejs'

/**
 * POST /api/cron/publish — scheduled-publish sweep.
 * Flips drafts whose publish_at is due into active listings and fires the
 * publish blast. Protected by x-cron-secret.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('x-cron-secret') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (secret && auth !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const res = await processScheduledPublishes()
  return NextResponse.json({ ok: true, ...res })
}
