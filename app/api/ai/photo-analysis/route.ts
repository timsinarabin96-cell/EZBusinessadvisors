/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { analyzeListingPhotos, isPhotoVisionConfigured } from '@/lib/photoVision'

export const runtime = 'nodejs'
export const maxDuration = 60

// =============================================================================
// POST /api/ai/photo-analysis — analyze listing gallery photos (vision).
// -----------------------------------------------------------------------------
// Body: { listingId }
// Loads the listing's gallery URLs, sends up to 6 images to Claude Vision, and
// returns a structured verdict: condition, assets, red flags, price signal,
// and a listing-boost caption angle. Server-only — the API key never ships.
// =============================================================================

const schema = z.object({ listingId: z.string().uuid() })

function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Server client not configured.' }, { status: 500 })

  if (!isPhotoVisionConfigured()) {
    return NextResponse.json({ ok: false, error: 'Photo AI is not configured yet — set ANTHROPIC_API_KEY.' }, { status: 503 })
  }

  const token = bearerToken(req)
  if (!token) return NextResponse.json({ ok: false, error: 'Missing authorization header.' }, { status: 401 })
  const { data: auth, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !auth?.user) return NextResponse.json({ ok: false, error: 'Invalid or expired session.' }, { status: 401 })

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ ok: false, error: 'Missing or invalid: listingId (uuid) required.' }, { status: 422 })
  }
  const { listingId } = parsed

  // Agency gate: caller must belong to the listing's agency (IDOR guard).
  const { data: listing, error: lErr } = await supabase
    .from('listings')
    .select('id, agency_id, business_name, industry, asking_price, sde, image_urls, gallery_json')
    .eq('id', listingId)
    .maybeSingle()
  if (lErr || !listing) return NextResponse.json({ ok: false, error: 'Listing not found.' }, { status: 404 })

  const agencyId = (listing as { agency_id?: string | null }).agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing has no agency.' }, { status: 404 })
  const { data: memberships } = await supabase.from('agency_members').select('agency_id').eq('profile_id', auth.user.id)
  const mine = new Set((memberships || []).map((m) => m.agency_id))
  if (!mine.has(agencyId)) {
    return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency.' }, { status: 403 })
  }

  const urls: string[] = Array.isArray((listing as any).image_urls) ? (listing as any).image_urls : []
  if (urls.length === 0) {
    const gj = (listing as any).gallery_json
    if (Array.isArray(gj)) urls.push(...gj.map((x: any) => (typeof x === 'string' ? x : x?.url)).filter(Boolean))
  }

  try {
    const result = await analyzeListingPhotos(urls, {
      businessName: (listing as any).business_name,
      industry: (listing as any).industry,
      askingPrice: (listing as any).asking_price,
      sde: (listing as any).sde,
    })
    if ('error' in result) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, analysis: result })
  } catch (e: any) {
    console.error('[photo-analysis]', e?.message)
    return NextResponse.json({ ok: false, error: 'Photo analysis failed.' }, { status: 502 })
  }
}
