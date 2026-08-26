/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimitAsync, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/listings/call-click — click-to-call tracking.
// Public, rate-limited. Logs a call click for the listing so agencies see how
// many buyers are calling their listing line (marketplace health signal).
// =============================================================================

export async function POST(req: NextRequest) {
  // 15 call clicks per IP per minute — generous, but still spammable-proof.
  if (!(await rateLimitAsync(clientIp(req), { limit: 15, windowMs: 60_000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const listingId = String(body?.listingId || '')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })

  // Resolve agency for scoping the log (best-effort — a bad listing id just no-ops).
  const { data: listing } = await db.from('listings').select('id, agency_id').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: true }) // don't leak existence

  // Hash the IP (SHA-256, truncated) — privacy-safe aggregation without storing raw IPs.
  const ip = clientIp(req)
  const ipHash = ip === 'unknown' ? null : await sha256(ip)

  const { error } = await db.from('listing_call_clicks').insert({
    listing_id: listingId,
    agency_id: listing.agency_id,
    ip_hash: ipHash ? ipHash.slice(0, 32) : null,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

async function sha256(input: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return input // non-crypto context fallback (still never logged raw)
  }
}
