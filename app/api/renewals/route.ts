/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { proposeRenewals, redeemRenewal } from '@/lib/listingExpiry'

export const runtime = 'nodejs'

/**
 * /api/renewals — auto-renewal machine
 *
 * POST { action: 'propose', agencyId } — scan expirations inside the 30-day
 *      window, email renewal proposals (refreshed valuation + one-click link).
 * GET  /api/renewals/redeem?listingId=...&token=... — public one-click renew
 *      link from the email. Extends the term 6 months + confirms to the seller.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body?.agencyId || '').trim()
  if (!agencyId || !canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const result = await proposeRenewals(agencyId)
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(req: NextRequest) {
  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!listingId || !token) {
    return NextResponse.json({ ok: false, error: 'Missing renewal link parameters' }, { status: 400 })
  }

  const result = await redeemRenewal(listingId, token)
  if (!result.ok) {
    return new NextResponse(
      `<html><body style="font-family:Georgia,serif;background:#faf9f4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
        <div style="text-align:center;max-width:480px;padding:32px">
          <div style="font-size:44px">⚠️</div>
          <h1 style="color:#1a1a2e;font-size:22px;margin:12px 0 8px">Renewal link not valid</h1>
          <p style="color:#666;font-size:14px;line-height:1.6">This link may have expired, or the listing term was already renewed. Contact your broker to renew your listing.</p>
        </div>
      </body></html>`,
      { status: 400, headers: { 'content-type': 'text/html' } },
    )
  }

  return new NextResponse(
    `<html><body style="font-family:Georgia,serif;background:#faf9f4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
      <div style="text-align:center;max-width:480px;padding:32px">
        <div style="font-size:44px">✅</div>
        <h1 style="color:#1a1a2e;font-size:22px;margin:12px 0 8px">Your listing is renewed</h1>
        <p style="color:#666;font-size:14px;line-height:1.6">Your new listing term runs through <strong>${result.expiresAt}</strong>. Your listing is live again in front of qualified buyers.</p>
        <a href="/marketplace/listings" style="display:inline-block;margin-top:16px;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px">Browse the marketplace</a>
      </div>
    </body></html>`,
    { status: 200, headers: { 'content-type': 'text/html' } },
  )
}
