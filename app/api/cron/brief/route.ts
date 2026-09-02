/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateCaptainsBrief } from '@/lib/captainsBrief'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

/**
 * POST /api/cron/brief — weekly Captain's Brief for all agencies.
 * Protected by x-cron-secret matching env CRON_SECRET (like the digest cron).
 * Emails every agency owner/admin: deals needing follow-up, expiring listings,
 * hot buyer matches, and the commission pipeline.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('x-cron-secret') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (secret && auth !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  }
  const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: agencies } = await svc.from('agencies').select('id')
  const results: Record<string, unknown>[] = []
  let recipients = 0
  for (const agency of agencies || []) {
    const brief = await generateCaptainsBrief(agency.id)
    recipients += brief.recipients
    results.push({ agencyId: agency.id, recipients: brief.recipients, followUps: brief.followUps.length, expiring: brief.expiring.length, matches: brief.matches.length, commissions: brief.commissions.length })
  }
  return NextResponse.json({ ok: true, agencies: results.length, recipients, results })
}
