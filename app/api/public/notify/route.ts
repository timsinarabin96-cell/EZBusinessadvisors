/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { subscribe } from '@/lib/notifySubscriptions'
import {rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

/**
 * /api/public/notify
 *
 * POST — public "notify me" capture (no auth). Body:
 *        { email, name?, criteria?: { industries?, max_price?, min_sde? }, agencyId? }
 * GET  — authenticated; list subscriptions for an agency via ?agencyId=
 */
export async function POST(req: NextRequest) {
  // Anti-abuse: public endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email : ''
  if (!email) {
    return NextResponse.json({ ok: false, error: 'email is required' }, { status: 400 })
  }

  const result = await subscribe({
    email,
    name: typeof body.name === 'string' ? body.name : null,
    phone: typeof body.phone === 'string' && body.phone ? body.phone : null,
    criteria: body.criteria && typeof body.criteria === 'object' ? body.criteria : {},
    agencyId: typeof body.agencyId === 'string' && body.agencyId ? body.agencyId : null,
  })
  if (!result.ok) {
    const status = result.error === 'not configured' ? 503 : 400
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }
  return NextResponse.json({ ok: true, subscription: result.data }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId')
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: 'agencyId query param is required' }, { status: 400 })
  }

  const { data, error } = await db
    .from('deal_notify_subscriptions')
    .select('*')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, agencyId, subscriptions: data || [] })
}
