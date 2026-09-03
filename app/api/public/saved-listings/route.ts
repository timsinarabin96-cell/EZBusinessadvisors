/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { notify } from '@/lib/email'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://concorddeal.com'

/** HMAC token proves the email address owns the bookmark list (sent in the email link). */
function tokenFor(email: string): string {
  const secret = process.env.CRON_SECRET || process.env.VERIFICATION_SECRET || 'saved-listings'
  return createHmac('sha256', secret).update(`saved:${email.toLowerCase()}`).digest('hex').slice(0, 40)
}

function tokenMatches(received: string, email: string): boolean {
  const a = Buffer.from(received || '')
  const b = Buffer.from(tokenFor(email))
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * POST /api/public/saved-listings { email, listingId, action: 'add' | 'remove' }
 * Saves/removes a listing bookmark keyed to the buyer's email (no password
 * needed — the email is the account). Returns a token the client can use to
 * re-open the list on any device.
 */
export async function POST(req: NextRequest) {
  if (!(await rateLimitAsync(clientIp(req), { limit: 20, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }

  const email = String(body.email || '').trim().toLowerCase()
  const listingId = String(body.listingId || '').trim()
  const action = body.action === 'remove' ? 'remove' : 'add'
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 })
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return NextResponse.json({ ok: false, error: 'A valid listing is required' }, { status: 400 })

  // Buyer profile keyed by email (find or create).
  const { data: existing } = await db.from('buyer_search_profiles').select('id, agency_id').eq('email', email).maybeSingle()
  let profile = existing
  if (!profile) {
    const { data: created, error: createErr } = await db
      .from('buyer_search_profiles')
      .insert({ email, notification_email: true, active: true, created_at: new Date().toISOString() })
      .select('id, agency_id')
      .single()
    if (createErr || !created) return NextResponse.json({ ok: false, error: 'Could not open your saved list' }, { status: 500 })
    profile = created
  }

  // agency_id is required on the bookmark row — take it from the listing when available.
  const { data: listing } = await db.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  const agencyId = listing?.agency_id || profile.agency_id || null
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing is not available' }, { status: 400 })

  if (action === 'remove') {
    await db
      .from('buyer_bookmarked_listings')
      .delete()
      .eq('buyer_profile_id', profile.id)
      .eq('listing_id', listingId)
    return NextResponse.json({ ok: true, saved: false, token: tokenFor(email), email })
  }

  const { error: upsertErr } = await db
    .from('buyer_bookmarked_listings')
    .upsert(
      { agency_id: agencyId, buyer_profile_id: profile.id, listing_id: listingId },
      { onConflict: 'buyer_profile_id,listing_id' },
    )
  if (upsertErr) return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 })

  // First save for this email → send the "your saved listings" link.
  const { count } = await db
    .from('buyer_bookmarked_listings')
    .select('id', { count: 'exact', head: true })
    .eq('buyer_profile_id', profile.id)
  if ((count ?? 0) === 1) {
    const link = `${SITE_URL}/marketplace/favorites?email=${encodeURIComponent(email)}&token=${tokenFor(email)}`
    try {
      await notify('generic', email, {
        title: '♥ Your saved listings are ready',
        message: `You saved a business you're interested in on Concord. <a href="${link}">Open your saved listings</a> — they stay saved on any device until the deal is gone.<br/><br/>No account needed; this link is private to this email address.`,
      })
    } catch { /* email is best-effort — the save itself succeeded */ }
  }

  return NextResponse.json({ ok: true, saved: true, token: tokenFor(email), email })
}

/**
 * GET /api/public/saved-listings?email=…&token=…
 * Returns the live saved listing ids for that email (sold/removed deals are
 * excluded automatically — the feed only contains live published listings).
 */
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase()
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!EMAIL_RE.test(email) || !tokenMatches(token, email)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data: profile } = await db.from('buyer_search_profiles').select('id').eq('email', email).maybeSingle()
  if (!profile) return NextResponse.json({ ok: true, ids: [] })

  const { data: rows } = await db
    .from('buyer_bookmarked_listings')
    .select('listing_id')
    .eq('buyer_profile_id', profile.id)
    .order('created_at', { ascending: false })
  return NextResponse.json({ ok: true, ids: (rows || []).map((r) => r.listing_id) })
}
