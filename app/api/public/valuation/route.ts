/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { notify } from '@/lib/email'
import { rateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

const AGENCY_ID = '354facdb-cce2-4eb0-a160-8454854e731a' // EZ Business Advisors

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/public/valuation — free valuation lead magnet (no auth).
 * Body: { name, email, phone?, business_name?, industry?, revenue_range?, location_general? }
 * Writes into seller_leads (CRM) and emails the broker inbox. Never throws.
 */
export async function POST(req: NextRequest) {
  // Anti-abuse: public endpoint — rate limited per IP.
  if (!rateLimit(clientIp(req), { limit: 10, windowMs: 60 * 1000 })) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const phone = String(body?.phone || '').trim()
  const businessName = String(body?.business_name || '').trim()
  const industry = String(body?.industry || '').trim()
  const revenueRange = String(body?.revenue_range || '').trim()
  const location = String(body?.location_general || '').trim()

  if (!name || !email) {
    return NextResponse.json({ ok: false, error: 'Name and email are required.' }, { status: 400 })
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }

  // 1) Record the seller lead in the CRM.
  const { error: leadErr } = await svc.from('seller_leads').insert({
    agency_id: AGENCY_ID,
    full_name: name,
    email,
    phone: phone || null,
    business_name: businessName || null,
    industry: industry || null,
    revenue_range: revenueRange || null,
    location_general: location || null,
    message: 'Free valuation request from the public website.',
    status: 'new',
  })
  if (leadErr) {
    return NextResponse.json({ ok: false, error: 'Could not record your request. Please try again.' }, { status: 500 })
  }

  // 2) Notify the brokers (queued email — SMTP when configured).
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
  await notify('generic', 'info@ezbusinessadvisors.com', {
    title: `Free valuation request: ${esc(businessName || name)}`,
    message: [
      `Name: ${esc(name)}`,
      `Email: ${esc(email)}`,
      phone ? `Phone: ${esc(phone)}` : '',
      businessName ? `Business: ${esc(businessName)}` : '',
      industry ? `Industry: ${esc(industry)}` : '',
      revenueRange ? `Revenue range: ${esc(revenueRange)}` : '',
      location ? `Location: ${esc(location)}` : '',
    ]
      .filter(Boolean)
      .join('<br/>'),
  })

  return NextResponse.json({ ok: true })
}
