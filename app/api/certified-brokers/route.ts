/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Public Certified Brokers directory — read-only roster for the public site.
// Uses the service role client so no auth is required (roster is public proof
// of broker certification). Never exposes the service key to the browser.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

export async function GET() {
  const svc = SVC
  if (!svc) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data, error } = await svc
    .from('certified_brokers')
    .select('*')
    .order('modules_certified', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, brokers: data || [] })
}
