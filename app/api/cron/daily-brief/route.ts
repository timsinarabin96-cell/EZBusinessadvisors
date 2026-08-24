import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateDailyBrief } from '@/lib/dailyBrief'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

/**
 * POST /api/cron/daily-brief — morning "Today at a Glance" for all agencies.
 * Protected by x-cron-secret matching env CRON_SECRET (like the brief cron).
 * Emails every agency owner/admin: new buyer leads, seller inquiries, NDA
 * signers, listings expiring within 7 days, and deal movement.
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
    const brief = await generateDailyBrief(agency.id)
    recipients += brief.recipients
    results.push({
      agencyId: agency.id,
      recipients: brief.recipients,
      newBuyers: brief.newBuyers.length,
      newSellers: brief.newSellers.length,
      ndaSigners: brief.ndaSigners.length,
      expiring: brief.expiring.length,
      dealMoves: brief.dealMoves.length,
    })
  }
  return NextResponse.json({ ok: true, agencies: results.length, recipients, results })
}
