/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { computeClosingRunway } from '@/lib/buyerPipelineCore'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/closing/runway?closeDate=YYYY-MM-DD — reverse closing timeline.
// Pure computation over the target close date; authenticated (any agency user).
// =============================================================================

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const closeDate = req.nextUrl.searchParams.get('closeDate')
  if (!closeDate || !/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) {
    return NextResponse.json({ ok: false, error: 'closeDate (YYYY-MM-DD) is required' }, { status: 400 })
  }

  const runway = computeClosingRunway(closeDate)
  return NextResponse.json({ ok: true, runway })
}
