/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { estimateClosingCosts } from '@/lib/closingCostsCore'

export const runtime = 'nodejs'

// =============================================================================
// GET /api/closing/costs?price=&inventory=&ffe=&coBrokerShare=
// Closing cost estimate (success fee, PA sales tax, legal, seller net).
// Pure computation; authenticated (any agency user).
// =============================================================================

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const price = Number(req.nextUrl.searchParams.get('price') || 0)
  const inventoryValue = Number(req.nextUrl.searchParams.get('inventory') || 0)
  const ffeValue = Number(req.nextUrl.searchParams.get('ffe') || 0)
  const coBrokerShare = Number(req.nextUrl.searchParams.get('coBrokerShare') || 0)
  if (!price || price <= 0) {
    return NextResponse.json({ ok: false, error: 'price is required' }, { status: 400 })
  }

  const breakdown = estimateClosingCosts({
    purchasePrice: price,
    inventoryValue,
    ffeValue,
    coBrokerShare,
  })
  return NextResponse.json({ ok: true, breakdown })
}
