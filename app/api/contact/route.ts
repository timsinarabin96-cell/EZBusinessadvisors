/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import {rateLimitAsync, clientIp } from '@/lib/rateLimit'
import { createServerClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

// ---------------------------------------------------------------------------
// POST /api/contact — public "Contact Us" form submission handler.
// No auth (by design — public route). Validates input, then:
//   1) Creates a REAL CRM lead (buyer_leads, source: 'contact_form') so the
//      traffic lands in the broker pipeline — not just an inbox.
//   2) In-app notification for the agency's brokers.
//   3) Emails the inbox (SMTP if configured, else queued to email_emails).
// Never throws — a failure returns a clean error, never a 500 HTML.
// ---------------------------------------------------------------------------

const CONTACT_INBOX = process.env.CONTACT_INBOX_EMAIL || 'info@ezbusinessadvisors.com'
const AGENCY_ID = process.env.VOICE_AGENT_AGENCY_ID || '354facdb-cce2-4eb0-a160-8454854e731a' // EZ Business Advisors default

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export async function POST(req: NextRequest) {
  // Spam guard — public endpoint, no auth: max 10 submissions/IP/minute.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60_000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests — try again shortly' }, { status: 429 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim()
  const phone = String(body?.phone || '').trim()
  const message = String(body?.message || '').trim()

  if (!name || !email || !message) {
    return NextResponse.json({ ok: false, error: 'Name, email, and message are required' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address' }, { status: 400 })
  }

  const html = `
    <p>New message from the public "Contact Us" form.</p>
    <table style="font-size:14px;border-collapse:collapse;width:100%;">
      <tr><td style="padding:6px 0;color:#8a8678;width:30%;">Name</td><td style="padding:6px 0;font-weight:600;">${esc(name)}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8678;">Email</td><td style="padding:6px 0;font-weight:600;">${esc(email)}</td></tr>
      <tr><td style="padding:6px 0;color:#8a8678;">Phone</td><td style="padding:6px 0;font-weight:600;">${esc(phone || '—')}</td></tr>
    </table>
    <p style="margin-top:16px;white-space:pre-wrap;">${esc(message)}</p>
  `

  // 1) CRM lead — the public contact form becomes a real lead in the pipeline.
  const svc = createServerClient()
  if (svc) {
    const { error: leadErr } = await svc.from('buyer_leads').insert({
      agency_id: AGENCY_ID,
      full_name: name,
      email: email.toLowerCase(),
      phone: phone || null,
      message: `Contact form: ${message}`.slice(0, 4000),
      source: 'contact_form',
      status: 'new',
    })
    if (leadErr) {
      console.error('contact lead insert failed:', leadErr.message)
      return NextResponse.json({ ok: false, error: 'Could not record your message. Please try again.' }, { status: 500 })
    }

    // 2) In-app notification for brokers — same pattern as seller intake.
    await createNotification({
      agency_id: AGENCY_ID,
      title: `New contact form message: ${name}`,
      body: `${name} (${email})${phone ? ` · ${phone}` : ''} — ${message.slice(0, 200)}`,
      kind: 'review',
      link: '/leads',
    }).catch(() => {})
  }

  // 3) Inbox email (queued when SMTP is unavailable).
  const result = await sendEmail({
    to: CONTACT_INBOX,
    subject: `Contact form: ${name}`,
    html,
    kind: 'generic',
    meta: { name, email, phone, source: 'contact_form' },
  })

  return NextResponse.json({ ok: result.ok })
}
