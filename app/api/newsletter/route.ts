/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimitAsync } from '@/lib/rateLimit'
import { makeUnsubToken } from '@/lib/newspaperShared'

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
  if (!(await rateLimitAsync(clientIp(req), { limit: 5, windowMs: 60 * 60 * 1000 }))) {
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

  // ALSO add to the newspaper subscriber list — this is the list the weekly
  // auto-newspaper cron (and the manual "📮 Email subscribers" button) reads.
  // One signup box, one subscriber, two lists kept in sync.
  // Manual upsert (not .upsert()) because the uniqueness constraint is on
  // lower(email), audience — a functional index PostgREST's onConflict can't
  // target reliably. Every new subscription defaults to audience='buyer' so
  // the weekly buyer digest is the only list a public signup ever joins.
  const { data: existingSub } = await svc
    .from('newspaper_subscriptions')
    .select('id, token')
    .ilike('email', email)
    .eq('audience', 'buyer')
    .maybeSingle()
  if (existingSub) {
    await svc.from('newspaper_subscriptions').update({ status: 'active', name: body.name || null, token: existingSub.token || makeUnsubToken(email) }).eq('id', existingSub.id)
      .then(({ error }) => { if (error) console.log('[newsletter] newspaper_subscriptions update skip:', error.message) })
  } else {
    await svc.from('newspaper_subscriptions').insert(
      { email, name: body.name || null, token: makeUnsubToken(email), status: 'active', audience: 'buyer' },
    ).then(({ error }) => { if (error) console.log('[newsletter] newspaper_subscriptions insert skip:', error.message) })
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
