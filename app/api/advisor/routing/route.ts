/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { createNotification } from '@/lib/notifications'
import { notify } from '@/lib/email'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/advisor/routing — free-tier advisor-routing hook (boss 08-31).
// When a free-tier seller is declined from AI intake (interview route 403
// "Free listings use the manual form"), the UI offers "work with a licensed
// advisor". This route captures that interest as a seller lead (source
// 'advisor_routing') for the agency, fires an in-app notification + email so
// a human advisor follows up. Never throws.
// =============================================================================

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().nullable(),
  businessName: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Name and a valid email are required' }, { status: 400 })
  }
  const { name, email, phone, businessName, notes } = parsed.data

  // Resolve the caller's agency (first membership — same pattern as the stale API).
  const agencyId = auth.memberships[0]?.agency_id
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  }

  try {
    const { error: leadErr } = await db.from('seller_leads').insert({
      agency_id: agencyId,
      full_name: name,
      email,
      phone: phone || null,
      business_name: businessName || null,
      message: notes || 'Free-tier seller declined AI intake — wants to work with a licensed advisor.',
      source: 'advisor_routing',
      status: 'new',
    })
    if (leadErr) throw leadErr
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Could not record your request: ${e?.message || 'unknown'}` }, { status: 500 })
  }

  // In-app notification for the agency's brokers.
  await createNotification({
    agency_id: agencyId,
    title: `Advisor-routing lead: ${businessName || name}`,
    body: `${name} (${email})${phone ? ` · ${phone}` : ''}${businessName ? ` · ${businessName}` : ''} — free-tier seller wants a licensed advisor.`,
    kind: 'review',
    link: '/leads',
  }).catch(() => {})

  // Email alert to the broker inbox.
  const esc = (s: string) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
  await notify('generic', 'info@ezbusinessadvisors.com', {
    title: `Advisor-routing lead: ${esc(businessName || name)}`,
    message: [
      `Name: ${esc(name)}`,
      `Email: ${esc(email)}`,
      phone ? `Phone: ${esc(phone)}` : '',
      businessName ? `Business: ${esc(businessName)}` : '',
      notes ? `Notes: ${esc(notes)}` : '',
      'Source: advisor_routing (free-tier AI-intake decline)',
    ].filter(Boolean).join('<br/>'),
  }).catch(() => {})

  return NextResponse.json({ ok: true, message: 'A licensed advisor will reach out shortly.' })
}
