/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateAiBriefing } from '@/lib/aiBriefing'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

/**
 * POST /api/cron/briefing — AI Daily Briefing for every agency, 6am daily.
 * Protected by x-cron-secret matching env CRON_SECRET (same as other crons).
 * Emails each agency's owners/admins: overdue tasks, due-today tasks,
 * deadlines in 72h, today's meetings, and deals going cold.
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
  let recipients = 0
  for (const agency of agencies || []) {
    const brief = await generateAiBriefing(agency.id)
    recipients += brief.recipients
    results.push({
      agencyId: agency.id,
      ok: brief.ok,
      recipients: brief.recipients,
      overdue: brief.overdue,
      dueToday: brief.dueToday,
      deadlines72h: brief.deadlines72h,
      appointmentsToday: brief.appointmentsToday,
      coldDeals: brief.coldDeals,
      headline: brief.headline,
      error: brief.error || undefined,
    })
  }
  return NextResponse.json({ ok: true, agencies: results.length, recipients, results })
}
