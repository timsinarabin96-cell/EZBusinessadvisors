/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * POST /api/invites/[token]/fill
 *   { targetType, data: {...}, active: boolean }
 * Invitee self-onboarding: creates/updates the directory row (professional or
 * broker), marks the invite filled, and stores their photo URL if provided.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { token } = await params
  const tokenValue = String(token || '')
  const { data: invite } = await db.from('invite_tokens').select('*').eq('token', tokenValue).maybeSingle()
  if (!invite) return NextResponse.json({ ok: false, error: 'Invite not found' }, { status: 404 })
  if (invite.status === 'revoked') return NextResponse.json({ ok: false, error: 'This invite was revoked' }, { status: 410 })
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: 'This invite has expired — ask the broker for a fresh link' }, { status: 410 })
  }

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }
  const data = body?.data || {}
  const active = body?.active !== false

  const agencyId = invite.agency_id || null

  try {
    if (invite.target_type === 'professional') {
      const { data: row, error } = await db.from('deal_professionals').insert({
        agency_id: agencyId,
        professional_type: data.professional_type || 'lawyer',
        name: String(data.name || '').trim(),
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
        email: String(data.email || '').trim() || null,
        phone: String(data.phone || '').trim() || null,
        avatar_url: String(data.avatar_url || '').trim() || null,
        is_active: active,
        is_platform_verified: false,
      }).select('id').single()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      await db.from('invite_tokens').update({ status: 'filled', target_id: row.id, filled_at: new Date().toISOString() }).eq('token', token)
      return NextResponse.json({ ok: true, id: row.id, targetType: 'professional' })
    }

    // Broker invite → create a public broker profile.
    const { data: row, error } = await db.from('broker_profiles').insert({
      profile_id: invite.created_by || null,
      agency_id: agencyId,
      public_name: String(data.name || '').trim(),
      title: String(data.title || '').trim() || 'Business Broker',
      bio: String(data.bio || '').trim() || null,
      avatar_url: String(data.avatar_url || '').trim() || null,
      phone: String(data.phone || '').trim() || null,
      email_public: String(data.email || '').trim() || null,
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
    await db.from('invite_tokens').update({ status: 'filled', target_id: row.id, filled_at: new Date().toISOString() }).eq('token', token)
    return NextResponse.json({ ok: true, id: row.id, targetType: 'broker' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Save failed' }, { status: 500 })
  }
}
