/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { PROFESSIONAL_TYPES, type ProfessionalType } from '@/lib/professionals'

export const runtime = 'nodejs'

const PUBLIC_SELECT =
  'id, agency_id, professional_type, name, firm, title, specialty, industries, states_served, country_code, license_number, license_state, license_verified, years_experience, deals_closed, bio, rates, website, email, phone, avatar_url, is_active, is_platform_verified, created_at'

/**
 * GET /api/professionals?type=&state=&industry=&query= — public directory search.
 * GET /api/professionals?mine=1 — authenticated broker's managed professionals.
 * POST /api/professionals — create (authenticated, agency member).
 * PATCH /api/professionals?id= — update (agency member).
 * DELETE /api/professionals?id= — delete (agency member).
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const type = req.nextUrl.searchParams.get('type')
  const state = req.nextUrl.searchParams.get('state')
  const industry = req.nextUrl.searchParams.get('industry')
  const query = req.nextUrl.searchParams.get('query')

  if (req.nextUrl.searchParams.get('mine') === '1') {
    const auth = await authenticateProfileRequest(req)
    if (!auth) return unauthorizedResponse()
    const { data: profile } = await db.from('profiles').select('agency_id').eq('id', auth.user.id).maybeSingle()
    const myAgency = profile?.agency_id || auth.memberships[0]?.agency_id || null
    let q2 = db.from('deal_professionals').select(PUBLIC_SELECT)
    if (myAgency) q2 = q2.eq('agency_id', myAgency)
    const { data, error } = await q2.order('created_at', { ascending: false })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, professionals: data })
  }

  let q = db.from('deal_professionals').select(PUBLIC_SELECT).eq('is_active', true)
  if (type && type !== 'all') q = q.eq('professional_type', type)
  if (state) q = q.contains('states_served', [state.toUpperCase()])
  if (industry) q = q.contains('industries', [industry])
  q = q.order('is_platform_verified', { ascending: false }).order('name', { ascending: true })

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  let rows = data || []
  if (query?.trim()) {
    const needle = query.trim().toLowerCase()
    rows = rows.filter((p: any) =>
      [p.name, p.firm, p.specialty, p.bio].some((v) => v && v.toLowerCase().includes(needle)),
    )
  }
  return NextResponse.json({ ok: true, professionals: rows })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })
  if (!body.name || !PROFESSIONAL_TYPES.includes(body.professional_type)) {
    return NextResponse.json({ ok: false, error: 'name and a valid professional_type are required' }, { status: 400 })
  }

  const { data: profile } = await db.from('profiles').select('agency_id').eq('id', auth.user.id).maybeSingle()
  const agencyId = profile?.agency_id || null

  const { data, error } = await db
    .from('deal_professionals')
    .insert({ ...body, agency_id: agencyId, is_active: body.is_active ?? true, professional_type: body.professional_type as ProfessionalType })
    .select('id')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 })

  const { data: rec } = await db.from('deal_professionals').select('agency_id').eq('id', id).maybeSingle()
  if (!rec) return NextResponse.json({ ok: false, error: 'Professional not found' }, { status: 404 })
  if (!auth.memberships.some((m) => m.agency_id === rec.agency_id)) {
    return NextResponse.json({ ok: false, error: 'Not a member of this record\'s agency' }, { status: 403 })
  }
  const { error } = await db.from('deal_professionals').update(body).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const { data: rec } = await db.from('deal_professionals').select('agency_id').eq('id', id).maybeSingle()
  if (!rec) return NextResponse.json({ ok: false, error: 'Professional not found' }, { status: 404 })
  if (!auth.memberships.some((m) => m.agency_id === rec.agency_id)) {
    return NextResponse.json({ ok: false, error: 'Not a member of this record\'s agency' }, { status: 403 })
  }

  const { error } = await db.from('deal_professionals').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
