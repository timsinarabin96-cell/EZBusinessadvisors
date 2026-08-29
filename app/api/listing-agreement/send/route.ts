/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageListing, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createSigningLinks } from '@/lib/documentSigning'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Exclusive Listing Agreement — the mandatory first document. No listing goes
// live without a signed one (enforced in /api/listings/publish).
const LA_TEMPLATE_ID = '562686a3-35bd-4069-9016-6dc10fcc1d7b'

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/**
 * POST /api/listing-agreement/send — one-click send the Exclusive Listing
 * Agreement to the seller. Body: { listingId }
 *
 * The listing record already exists (draft). This creates the agreement
 * document from the template, pre-filled from the listing + agency, emails
 * the seller a signing link; the broker counter-signs from the dashboard.
 * Access: agent on their own listing, or broker/admin/owner agency-wide.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const listingId = String(body.listingId || '').trim()
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  const { data: listing } = await db
    .from('listings')
    .select('id, agency_id, agent_id, business_name, asking_price, owner_email, commission_split_agent, commission_split_brokerage')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageListing(auth, { agency_id: listing.agency_id, agent_id: listing.agent_id })) return forbiddenResponse()

  const sellerEmail = String(body.sellerEmail || listing.owner_email || '').trim().toLowerCase()
  const sellerName = String(body.sellerName || '').trim()
  if (!sellerEmail) {
    return NextResponse.json({ ok: false, error: 'Seller email is required — add the owner email to the listing or pass sellerEmail.' }, { status: 400 })
  }

  const agencyId = listing.agency_id
  const { data: agency } = await db.from('agencies').select('name').eq('id', agencyId).maybeSingle()
  const agencyName = agency?.name || 'the Brokerage'
  const brokerName = (auth.profile as { full_name?: string | null }).full_name || 'the Broker'
  const brokerEmail = auth.user.email || ''

  // Already sent? Don't duplicate.
  const { data: existing } = await db
    .from('documents')
    .select('id, status')
    .eq('template_id', LA_TEMPLATE_ID)
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing && existing.status !== 'signed') {
    return NextResponse.json({ ok: false, error: 'A listing agreement is already pending for this listing — the seller needs to sign it, or you can approve it from the Listing Agreements page.' }, { status: 409 })
  }

  const commissionRate = Number(listing.commission_split_agent ?? listing.commission_split_brokerage ?? 6)
  const filled = {
    title: 'Exclusive Listing Agreement',
    listing_date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    seller_name: sellerName || 'the Seller',
    seller_entity_type: 'an individual or entity',
    broker_name: brokerName,
    agency_name: agencyName,
    business_name: listing.business_name || 'the Business',
    asking_price: listing.asking_price ? String(listing.asking_price) : '',
    commission_rate: String(commissionRate),
    minimum_commission: '',
    term_months: '12',
    tail_period: '12 months',
    LEGAL_FOOTER: '',
  }

  const parties = [
    { key: 'seller', label: 'Seller', role: 'seller', name: sellerName || 'Seller', email: sellerEmail },
    { key: 'broker', label: 'Broker', role: 'broker', name: brokerName, email: brokerEmail },
  ]

  const { data: doc, error: docErr } = await db
    .from('documents')
    .insert({
      template_id: LA_TEMPLATE_ID,
      listing_id: listingId,
      deal_id: null,
      title: `Listing Agreement — ${listing.business_name || 'Deal'}`,
      status: 'pending_signature',
      filled_data: filled,
      parties,
      created_by: auth.user.id,
    })
    .select('id')
    .single()
  if (docErr || !doc) {
    return NextResponse.json({ ok: false, error: docErr?.message || 'Could not create listing agreement' }, { status: 500 })
  }

  const res = await createSigningLinks(doc.id, parties)
  if (!res.ok || !res.links) {
    return NextResponse.json({ ok: false, error: res.error || 'Could not create signing links' }, { status: 500 })
  }
  const sellerLink = res.links.find((l) => l.partyKey === 'seller')

  if (sellerLink) {
    const business = listing.business_name || 'the business'
    await sendEmail({
      to: sellerEmail,
      subject: `Please sign the Listing Agreement for ${business}`,
      html: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:28px 20px">
  <div style="font-size:12px;letter-spacing:0.25em;color:#c9a84c;font-weight:800;margin-bottom:18px">CONCORD · DEAL PLATFORM</div>
  <h2 style="color:#1a1a2e;margin:0 0 6px">Review &amp; sign the Listing Agreement</h2>
  <p style="color:#666;font-size:13px;margin:0 0 18px">${esc(agencyName)} · Secure signing</p>
  <p style="color:#26303f;font-size:15px;line-height:1.6">Hi ${esc(sellerName || 'there')},</p>
  <p style="color:#26303f;font-size:15px;line-height:1.6">Your broker at <strong>${esc(agencyName)}</strong> has prepared the exclusive listing agreement for <strong>${esc(business)}</strong>. Please review and sign it using the secure link below:</p>
  <p style="margin:22px 0">
    <a href="${sellerLink.url}" style="display:inline-block;background:#1a1a2e;color:#c9a84c;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:800;font-size:15px">✍️ Sign the Listing Agreement</a>
  </p>
  <p style="color:#666;font-size:13px;line-height:1.6">Signing takes about a minute. Your signature, timestamp, and IP are recorded — electronic signatures are legally binding.</p>
  <p style="color:#aaa;font-size:11.5px;margin-top:26px">© 2026 ${esc(agencyName)} · Concord Deal Platform</p>
</div>`,
      kind: 'nda_request_received',
      meta: { documentId: doc.id, listingId },
    }).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    documentId: doc.id,
    sellerUrl: sellerLink?.url || null,
    message: `Listing agreement sent to ${sellerEmail} — they sign, then you approve from the Listing Agreements page.`,
  }, { status: 201 })
}
