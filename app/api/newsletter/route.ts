/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// POST /api/newsletter — public newsletter signup.
// Stores subscribers in platform_settings (JSON, key newsletter_subscribers)
// so no DDL is required. Also queues a welcome email via email_emails.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

const clientIp = (req: NextRequest) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

const KEY = 'newsletter_subscribers'

interface Subscriber {
  email: string
  source?: string | null
  created_at: string
}

export async function POST(req: NextRequest) {
  // Anti-spam: 5 newsletter signups per IP per hour.
  if (!rateLimit(clientIp(req), { limit: 5, windowMs: 60 * 60 * 1000 })) {
    return NextResponse.json({ ok: false, error: 'Too many signups. Try again later.' }, { status: 429 })
  }

  const svc = SVC
  if (!svc) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const email = (body.email || '').trim().toLowerCase()
  const source = (body.source || 'footer').trim().slice(0, 60)

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 })
  }

  // Read existing subscribers (JSON blob).
  const { data: row } = await svc.from('platform_settings').select('value').eq('key', KEY).maybeSingle()
  let subs: Subscriber[] = []
  try {
    const parsed = row?.value ? JSON.parse(row.value) : []
    subs = Array.isArray(parsed) ? parsed : []
  } catch { /* reset */ }

  if (!subs.some((s) => s.email === email)) {
    subs.push({ email, source, created_at: new Date().toISOString() })
    await svc.from('platform_settings').upsert(
      { key: KEY, value: JSON.stringify(subs), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  }

  // Queue a welcome email (best-effort; flushes when SMTP is configured).
  await svc.from('email_emails').insert({
    email_to: email,
    subject: 'Welcome to Concord Insights 🌒',
    kind: 'newsletter_welcome',
    html: `<p>Thanks for subscribing! You'll get market multiples, SBA updates, and selling tips — no spam, ever.</p><p>— The Concord Team</p>`,
    text: "Thanks for subscribing to Concord Insights! You'll get market multiples, SBA updates, and selling tips — no spam, ever.",
    status: 'queued',
  }).then(({ error }) => { if (error) console.log('[newsletter] email queue skip:', error.message) })

  return NextResponse.json({ ok: true })
}
