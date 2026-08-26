/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generateInviteToken } from '@/lib/invites'
import { rateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

/**
 * POST /api/directory/join
 * Public self-onboarding: a professional/broker signs up from the website
 * with all their details + photo. Auto-saves to the directory and creates a
 * management token so they can subscribe/unsubscribe themselves.
 *   { targetType, data, active }
 */
export async function POST(req: NextRequest) {
  // Anti-abuse: public-ish endpoint — rate limited per IP.
  if (!rateLimit(clientIp(req), { limit: 10, windowMs: 60 * 1000 })) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }
  const data = body?.data || {}
  const active = body?.active !== false
  const targetType = body?.targetType === 'broker' ? 'broker' : 'professional'

  const name = String(data.name || '').trim()
  if (!name) return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 })
  const email = String(data.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 })

  // Prevent duplicate signups by email.
  const checkTable = targetType === 'broker' ? 'broker_profiles' : 'deal_professionals'
  const { data: existing } = await db.from(checkTable).select('id').eq('email', email).maybeSingle()
  if (existing) {
    return NextResponse.json({ ok: false, error: 'This email is already in the directory — use your manage link to update or subscribe/unsubscribe.' }, { status: 409 })
  }

  try {
    let rowId: string
    if (targetType === 'broker') {
      const { data: row, error } = await db.from('broker_profiles').insert({
        public_name: name,
        title: String(data.title || '').trim() || 'Business Broker',
        bio: String(data.bio || '').trim() || null,
        avatar_url: String(data.avatar_url || '').trim() || null,
        phone: String(data.phone || '').trim() || null,
        email_public: email,
        linkedin: String(data.linkedin || '').trim() || null,
        expertise: Array.isArray(data.expertise) ? data.expertise : [],
        industries: Array.isArray(data.industries) ? data.industries : [],
        markets: Array.isArray(data.markets) ? data.markets : [],
        credentials: Array.isArray(data.credentials) ? data.credentials : [],
        years_experience: data.years_experience != null && data.years_experience !== '' ? Number(data.years_experience) : null,
        closed_deals_count: data.closed_deals_count != null && data.closed_deals_count !== '' ? Number(data.closed_deals_count) : 0,
        is_public: active,
        profile_status: active ? 'active' : 'hidden',
      }).select('id').single()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      rowId = row.id
    } else {
      const { data: row, error } = await db.from('deal_professionals').insert({
        professional_type: String(data.professional_type || 'lawyer'),
        name,
        firm: String(data.firm || '').trim() || null,
        title: String(data.title || '').trim() || null,
        specialty: String(data.specialty || '').trim() || null,
        industries: Array.isArray(data.industries) ? data.industries : [],
        states_served: Array.isArray(data.states_served) ? data.states_served : ['US'],
        country_code: String(data.country_code || 'US').toUpperCase(),
        license_number: String(data.license_number || '').trim() || null,
        license_state: String(data.license_state || '').trim().toUpperCase() || null,
        license_verified: false,
        years_experience: data.years_experience != null && data.years_experience !== '' ? Number(data.years_experience) : null,
        deals_closed: data.deals_closed != null && data.deals_closed !== '' ? Number(data.deals_closed) : null,
        bio: String(data.bio || '').trim() || null,
        rates: String(data.rates || '').trim() || null,
        website: String(data.website || '').trim() || null,
        email,
        phone: String(data.phone || '').trim() || null,
        avatar_url: String(data.avatar_url || '').trim() || null,
        is_active: active,
        is_platform_verified: false,
      }).select('id').single()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      rowId = row.id
    }

    // Management token → they can subscribe/unsubscribe themselves.
    const manageToken = generateInviteToken()
    await db.from('invite_tokens').insert({
      token: manageToken,
      target_type: targetType,
      target_id: rowId,
      email,
      status: 'filled',
      filled_at: new Date().toISOString(),
      expires_at: null,
    })

    const origin = req.headers.get('origin') || 'https://concord-deal-platform.vercel.app'
    return NextResponse.json({
      ok: true,
      id: rowId,
      targetType,
      manageUrl: `${origin}/invite/${manageToken}`,
      publicUrl: targetType === 'broker' ? `${origin}/marketplace/brokers/${rowId}` : `${origin}/marketplace/professionals/${rowId}`,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Save failed' }, { status: 500 })
  }
}
