/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendHighAlert } from '@/lib/highAlerts'

export const runtime = 'nodejs'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://concorddeal.com'

/**
 * POST /api/cron/health-check — every 15 min. Pings the public site + the
 * Stripe webhook endpoint; on ANY failure, emails the boss. Self-healing:
 * if the site is down, the boss knows within 15 minutes instead of days.
 * Protected by x-cron-secret. Returns JSON (OpenClaw/Telegram can announce).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('x-cron-secret') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (secret && auth !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const checks: { name: string; ok: boolean; detail?: string }[] = []

  // 1) Public site responds.
  try {
    const r = await fetch(`${APP_URL}/pricing`, { signal: AbortSignal.timeout(15_000) })
    checks.push({ name: 'public site', ok: r.ok, detail: r.status + '' })
  } catch (e: any) {
    checks.push({ name: 'public site', ok: false, detail: e?.message?.slice(0, 80) })
  }

  // 2) Supabase reachable (service-role ping).
  try {
    const svc = SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null
    const { error } = svc ? await svc.from('agencies').select('id').limit(1) : { error: new Error('not configured') }
    checks.push({ name: 'supabase', ok: !error, detail: error?.message?.slice(0, 80) })
  } catch (e: any) {
    checks.push({ name: 'supabase', ok: false, detail: e?.message?.slice(0, 80) })
  }

  // 3) Stripe webhook endpoint reachable (no signature → expect 400, not 5xx/timeout).
  try {
    const r = await fetch(`${APP_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'evt_healthcheck' }),
      signal: AbortSignal.timeout(15_000),
    })
    // A 400 (bad signature) means the endpoint is ALIVE. 5xx/timeout = broken.
    checks.push({ name: 'stripe webhook', ok: r.status === 400 || r.status === 401 || r.status === 200, detail: r.status + '' })
  } catch (e: any) {
    checks.push({ name: 'stripe webhook', ok: false, detail: e?.message?.slice(0, 80) })
  }

  // 4) Placeholder-image route — the [SENSITIVE]-URL incident broke every
  //    listing image silently; catch regressions before buyers see them.
  try {
    const r = await fetch(`${APP_URL}/api/listing-images/placeholder?title=Health+Check&industry=Business+Services`, {
      signal: AbortSignal.timeout(15_000),
    })
    const ct = r.headers.get('content-type') || ''
    const okImage = r.ok && (ct.includes('image') || ct.includes('svg'))
    checks.push({ name: 'placeholder image', ok: okImage, detail: `${r.status} ${ct.slice(0, 24)}` })
  } catch (e: any) {
    checks.push({ name: 'placeholder image', ok: false, detail: e?.message?.slice(0, 80) })
  }

  const failed = checks.filter((c) => !c.ok)
  if (failed.length) {
    const lines = [
      ...checks.map((c) => `• ${c.name}: ${c.ok ? '✅ ok' : `❌ ${c.detail || 'down'}`}`),
      'The next cron run will re-check automatically. If this persists, the platform needs attention.',
    ].join('\n')
    await sendHighAlert({ summary: `Platform health check failed: ${failed.map((failure) => failure.name).join(', ')}`, details: lines, meta: { source: 'cron-health-check', failed: failed.map((failure) => failure.name) } }).catch(() => {})
  }

  return NextResponse.json({ ok: failed.length === 0, checks, failed: failed.map((f) => f.name) })
}
