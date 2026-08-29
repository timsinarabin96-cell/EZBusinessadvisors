/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { fetchMarketplaceStats } from '@/lib/marketplace'
import { buildAdvertiserPitchPdf } from '@/lib/advertiserPitchPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =============================================================================
// /api/admin/ads/pitch — "Advertise with Concord" one-page pitch PDF.
// Platform admin only. Live marketplace stats + the rate card, styled like
// the analytics/CIM/BOV exports. Download button lives on /admin/ads.
// =============================================================================

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }

  const stats = await fetchMarketplaceStats(null)

  const db = createServerClient()
  let contactEmail = process.env.ADVERTISING_EMAIL || 'advertising@ezbusinessadvisors.vercel.app'
  let contactPhone: string | undefined
  if (db) {
    const { data } = await db.from('agencies').select('name, contact_email, phone').limit(1).maybeSingle()
    if (data?.contact_email) contactEmail = data.contact_email
    if (data?.phone) contactPhone = data.phone
  }

  const pdf = buildAdvertiserPitchPdf({
    stats: {
      totalListings: stats.totalListings,
      avgAsking: stats.avgAsking,
      totalBusinessesSold: stats.totalBusinessesSold,
      industries: stats.industries,
    },
    contactEmail,
    contactPhone,
  })

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="advertise-with-concord.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}
