/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { recordProviderCosts } from '@/lib/providerCosts'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/cron/provider-costs — daily automated cost capture.
// Pulls real usage costs from every connected provider (Twilio, DeepSeek,
// Anthropic, OpenAI, Supabase, Vercel) and records them into `expenses`
// with dedupe, so the books stay current with ZERO manual entry.
// Protected by CRON_SECRET (same pattern as all other cron jobs).
// =============================================================================

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('x-cron-secret')
  if (secret && auth !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { added, skipped, providerLines } = await recordProviderCosts()
  return NextResponse.json({
    ok: true,
    summary: { added: added.length, skipped: skipped.length, providerLines },
    skipped,
  })
}
