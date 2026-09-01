/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { runSellerNurture } from '@/lib/sellerNurture'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/cron/seller-nurture — automated follow-up for PAID seller listings.
 * Protected by x-cron-secret (CRON_SECRET). Runs the full nurture pass:
 *   → 24h: interview not started / partially done → nudge with progress
 *   → 48h: no docs uploaded → "why documents power your CIM"
 *   → 72h/120h: escalating reminders
 *   → 168h: stalled → flag to agency admin + platform owner
 *   → complete (interview + docs + CIM) → retire the row, no more mail
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('x-cron-secret')
  if (secret && auth !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const result = await runSellerNurture()
  return NextResponse.json({ ok: true, ...result })
}
