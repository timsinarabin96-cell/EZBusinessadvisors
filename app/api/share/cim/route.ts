/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageListing, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/**
 * POST /api/share/cim — share a CIM with NDA-signed buyers.
 *   { cimId, listingId }            → list NDA-signed buyers for that listing
 *   { cimId, listingId, buyerEmail, sendEmail? } → build the personalized
 *     link (email baked in so the gate opens automatically) and optionally
 *     email it to the buyer.
 *
 * Only NDA-signed buyers are shareable — the CIM never goes to anyone else.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const cimId = String(body.cimId || '').trim()
  const listingId = String(body.listingId || '').trim()
  const buyerEmail = String(body.buyerEmail || '').trim().toLowerCase()
  const shouldEmail = body.sendEmail === true

  if (!cimId || !listingId) return NextResponse.json({ ok: false, error: 'cimId and listingId are required' }, { status: 400 })

  const { data: listing } = await db.from('listings').select('agency_id, agent_id, business_name').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageListing(auth, { agency_id: listing.agency_id, agent_id: listing.agent_id })) return forbiddenResponse()

  // NDA-signed buyers on this listing: documents → signatures (buyer party, signed).
  const { data: docs } = await db.from('documents').select('id').eq('listing_id', listingId)
  const docIds = (docs || []).map((d: any) => d.id)
  let buyers: Array<{ email: string; name: string | null; signed_at: string | null }> = []
  if (docIds.length > 0) {
    const { data: sigs } = await db
      .from('document_signatures')
      .select('party_email, party_name, signed_at')
      .eq('status', 'signed')
      .eq('party_key', 'buyer')
      .in('document_id', docIds)
      .order('signed_at', { ascending: false })
    const seen = new Set<string>()
    for (const s of (sigs || []) as any[]) {
      const e = String(s.party_email || '').trim().toLowerCase()
      if (!e || seen.has(e)) continue
      seen.add(e)
      buyers.push({ email: e, name: s.party_name || null, signed_at: s.signed_at || null })
    }
  }

  if (!buyerEmail) {
    return NextResponse.json({ ok: true, buyers })
  }

  // Target buyer must be NDA-signed on this listing.
  const target = buyers.find((b) => b.email === buyerEmail)
  if (!target) {
    return NextResponse.json({ ok: false, error: 'This buyer has not signed the NDA for this listing — only NDA-signed buyers can receive the CIM.' }, { status: 403 })
  }

  const link = `${APP_URL}/share/cim/${cimId}?email=${encodeURIComponent(buyerEmail)}`
  let emailed = false
  if (shouldEmail) {
    const business = listing.business_name || 'the business'
    const sent = await sendEmail({
      to: buyerEmail,
      subject: `Confidential Information Memorandum — ${business}`,
      html: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:28px 20px">
  <div style="font-size:12px;letter-spacing:0.25em;color:#c9a84c;font-weight:800;margin-bottom:18px">CONCORD · DEAL PLATFORM</div>
  <h2 style="color:#1a1a2e;margin:0 0 6px">Your confidential CIM is ready</h2>
  <p style="color:#26303f;font-size:15px;line-height:1.6">Hi ${esc(target.name || 'there')},</p>
  <p style="color:#26303f;font-size:15px;line-height:1.6">Thank you for signing the NDA for <strong>${esc(business)}</strong>. The Confidential Information Memorandum is now available — it contains the full confidential overview of the business.</p>
  <p style="margin:22px 0">
    <a href="${link}" style="display:inline-block;background:#1a1a2e;color:#c9a84c;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:800;font-size:15px">📑 View the CIM</a>
  </p>
  <p style="color:#666;font-size:13px;line-height:1.6">This document is confidential — please do not share it. Electronic access is recorded.</p>
  <p style="color:#aaa;font-size:11.5px;margin-top:26px">© 2026 Concord Deal Platform</p>
</div>`,
      kind: 'document_upload',
      meta: { cimId, listingId, buyerEmail },
    }).catch(() => ({ ok: false }))
    emailed = sent.ok
  }

  return NextResponse.json({ ok: true, link, emailed, buyer: target })
}
