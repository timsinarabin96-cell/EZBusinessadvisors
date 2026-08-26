/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateDigestForAgency } from '@/lib/dealDigest'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

/**
 * POST /api/cron/digest — weekly deal digest for all agencies.
 * Protected by x-cron-secret matching env CRON_SECRET (like check-trials).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('x-cron-secret')
  if (secret && auth !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  }
  const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: agencies } = await svc.from('agencies').select('id')
  const results: Record<string, unknown>[] = []
  for (const agency of agencies || []) {
    const summary = await generateDigestForAgency(agency.id)
    results.push({ agencyId: agency.id, ...summary })
  }
  return NextResponse.json({ ok: true, agencies: results.length, results })
}
