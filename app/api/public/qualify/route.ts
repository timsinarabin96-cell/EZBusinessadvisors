/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { QUALIFY_QUESTIONS, scoreQualification, type QualifyAnswer } from '@/lib/buyerQualify'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

// =============================================================================
// POST /api/public/qualify — BUYER QUALIFICATION AGENT (the gate before NDA).
// -----------------------------------------------------------------------------
// Public + accountless (like the NDA sign route). Body:
//   { listingId, name, email, answers: [{key, value}] }
// Scores the buyer against the listing (asking price, SDE, industry) and:
//   - returns { decision, score, reasons, next }
//   - ALWAYS saves the buyer as a lead (never wasted) with qualification data
//   - qualified → next:'nda'  ·  maybe → next:'proof_of_funds'  ·  else 'hold'
// =============================================================================

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  // Anti-abuse: public endpoint — rate limited per IP (same as NDA sign).
  if (!(await rateLimitAsync(ip, { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const listingId = String(body?.listingId || '').trim()
  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim()
  const answers: QualifyAnswer[] = Array.isArray(body?.answers) ? body.answers : []
  if (!listingId || !name || !email) {
    return NextResponse.json({ ok: false, error: 'Name, email, and listing are required.' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }

  // Only a published listing can be qualified against (same gate as NDA sign).
  const { data: feed } = await svc.rpc('get_public_listing_feed', { p_slug: listingId })
  const listingRow = Array.isArray(feed) ? feed[0] : null
  if (!listingRow) {
    return NextResponse.json({ ok: false, error: 'Listing not found.' }, { status: 404 })
  }
  const listingIdUuid = listingRow.listing_id
  const askingPrice = listingRow.asking_price != null ? Number(listingRow.asking_price) || null : null
  const sde = listingRow.sde != null ? Number(listingRow.sde) || null : null
  const industry = listingRow.industry || null

  const result = scoreQualification(answers, { askingPrice, sde, industry })

  // Always save the buyer as a lead with the qualification baked in.
  try {
    const q = answers.reduce<Record<string, string>>((acc, a) => { acc[a.key] = String(a.value ?? ''); return acc }, {})
    const { data: existing } = await svc.from('buyer_leads').select('id').eq('email', email).maybeSingle()
    const payload: Record<string, unknown> = {
      full_name: name,
      email,
      listing_id: listingIdUuid,
      industry_interest: industry,
      desired_business_type: industry,
      funds_available: q.funds ? Number(String(q.funds).replace(/[^0-9.]/g, '')) || null : null,
      financing_method: q.financing ? String(q.financing) : null,
      preferred_location: q.location ? String(q.location) : null,
      timeframe: q.timeline ? String(q.timeline) : null,
      budget_range: q.budget ? String(q.budget) : null,
      status: result.decision === 'qualified' ? 'qualified' : result.decision === 'maybe' ? 'qualifying' : 'new',
      source: 'qualify_gate',
      notes: `Qualify score ${result.score}/100 → ${result.decision}. Reasons: ${result.reasons.join('; ')}`,
      verified_buyer: result.decision === 'qualified',
    }
    if (existing?.id) {
      await svc.from('buyer_leads').update({ ...payload, notes: payload.notes }).eq('id', existing.id)
    } else {
      await svc.from('buyer_leads').insert({ ...payload, agency_id: listingRow.agency_id || null })
    }
  } catch (e) {
    console.error('[qualify] lead save failed:', (e as Error)?.message)
  }

  return NextResponse.json({ ok: true, ...result, questions: QUALIFY_QUESTIONS })
}
