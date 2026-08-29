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

// Canonical universal NDA template (platform-level, applies to every listing & buyer).
const NDA_TEMPLATE_ID = 'd119a19b-8f74-43b6-8ed9-719e334b9391'

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

/**
 * POST /api/nda/send — one-click NDA from a buyer lead.
 * Body: { leadId }
 *
 * Flow: resolve lead → listing → tenant agency; access-check (agent owns the
 * listing OR broker/admin/owner of the agency); create the NDA document from
 * the universal NDA template pre-filled from the lead + listing; create
 * signing links (buyer emailed, broker counter-signs in the dashboard);
 * email the buyer; link everything to the deal. Tenant-walled by agency_id.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const leadId = String(body.leadId || '').trim()
  if (!leadId) return NextResponse.json({ ok: false, error: 'leadId is required' }, { status: 400 })

  const { data: lead } = await db.from('buyer_leads').select('*').eq('id', leadId).maybeSingle()
  if (!lead) return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 })

  const listingId = lead.listing_id
  if (!listingId) return NextResponse.json({ ok: false, error: 'Lead has no linked listing — attach it to a listing first.' }, { status: 400 })

  const { data: listing } = await db
    .from('listings')
    .select('agency_id, business_name, asking_price, listing_ref, location_general, agent_id')
    .eq('id', listingId)
    .maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  // Access: agent → own listings only; broker/admin/owner → any agency listing.
  if (!canManageListing(auth, { agency_id: listing.agency_id, agent_id: listing.agent_id })) return forbiddenResponse()

  const agencyId = listing.agency_id
  const { data: agency } = await db.from('agencies').select('name').eq('id', agencyId).maybeSingle()
  const agencyName = agency?.name || 'the Brokerage'
  const brokerName = (auth.profile as { full_name?: string | null }).full_name || 'the Broker'
  const brokerEmail = auth.user.email || ''

  const buyerName = lead.full_name || lead.contact_name || lead.company || 'the Buyer'
  const buyerEmail = String(lead.email || '').trim().toLowerCase()
  if (!buyerEmail) return NextResponse.json({ ok: false, error: 'Lead has no email address.' }, { status: 400 })

  // ── Per-listing lock: an NDA ties the buyer to ONE listing. ─────────────
  // 1) No duplicate NDA on the same listing for the same buyer (another agent
  //    can't poach this buyer on this listing — the first NDA locks it).
  const { data: listingDocs } = await db.from('documents').select('id').eq('listing_id', listingId)
  const listingDocIds = (listingDocs || []).map((d: any) => d.id)
  if (listingDocIds.length > 0) {
    const { data: existingSig } = await db
      .from('document_signatures')
      .select('id, status')
      .eq('party_key', 'buyer')
      .eq('party_email', buyerEmail)
      .in('document_id', listingDocIds)
      .limit(1)
    if (existingSig && existingSig.length > 0) {
      const { data: sigDoc } = await db
        .from('document_signatures')
        .select('document_id, signed_at')
        .eq('party_key', 'buyer')
        .eq('party_email', buyerEmail)
        .in('document_id', listingDocIds)
        .order('created_at', { ascending: false })
        .limit(1)
      const signed = existingSig[0].status === 'signed'
      return NextResponse.json({
        ok: false,
        error: signed
          ? `This buyer already signed the NDA for this listing — the buyer is locked to this business with the agent who sent it. Another agent can still work with this buyer on a DIFFERENT listing (a new NDA is required per business).`
          : 'An NDA is already pending for this buyer on this listing — wait for them to sign, or cancel it first.',
        locked: true,
        documentId: (sigDoc && sigDoc[0]?.document_id) || null,
      }, { status: 409 })
    }
  }

  // 2) Optional guard (broker preference): a buyer who signed an NDA on
  //    another listing must sign a NEW NDA per business — which is exactly
  //    what this flow does. CIM access stays per-listing via the gate.

  // Find or create the deal for this listing + buyer lead.
  let dealId: string | null = null
  const { data: existingDeal } = await db
    .from('deals')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_lead_id', lead.id)
    .maybeSingle()
  if (existingDeal) {
    dealId = existingDeal.id
  } else {
    const { data: created, error: dealErr } = await db
      .from('deals')
      .insert({
        listing_id: listingId,
        buyer_lead_id: lead.id,
        agency_id: agencyId,
        status: 'letter_of_intent',
        title: `NDA — ${listing.business_name || 'Deal'}`,
      })
      .select('id')
      .single()
    if (dealErr || !created) {
      return NextResponse.json({ ok: false, error: dealErr?.message || 'Could not create deal' }, { status: 500 })
    }
    dealId = created.id
  }

  // NDA document — pre-filled from lead + listing + brokerage.
  const now = new Date()
  const filled = {
    title: 'Confidentiality, Non-Disclosure & Registration Agreement',
    nda_date: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    prospect_name: buyerName,
    prospect_entity: lead.company || '',
    broker_name: brokerName,
    agency_name: agencyName,
    business_name: listing.business_name || 'the Business',
    listing_ref: listing.listing_ref || listingId || '',
    location_general: listing.location_general || '',
    asking_price: listing.asking_price ? String(listing.asking_price) : '',
    confidentiality_period: 'two (2) years',
    LEGAL_FOOTER: '',
  }

  const parties = [
    { key: 'buyer', label: 'Buyer', role: 'buyer', name: buyerName, email: buyerEmail },
    { key: 'broker', label: 'Broker', role: 'broker', name: brokerName, email: brokerEmail },
  ]

  const { data: doc, error: docErr } = await db
    .from('documents')
    .insert({
      template_id: NDA_TEMPLATE_ID,
      listing_id: listingId,
      deal_id: dealId,
      title: `NDA — ${listing.business_name || 'Deal'}`,
      status: 'pending_signature',
      filled_data: filled,
      parties,
      created_by: auth.user.id,
    })
    .select('id')
    .single()
  if (docErr || !doc) {
    return NextResponse.json({ ok: false, error: docErr?.message || 'Could not create NDA document' }, { status: 500 })
  }

  // Signing links — buyer link is emailed; broker counter-signs in the dashboard.
  const res = await createSigningLinks(doc.id, parties)
  if (!res.ok || !res.links) {
    return NextResponse.json({ ok: false, error: res.error || 'Could not create signing links' }, { status: 500 })
  }
  const buyerLink = res.links.find((l) => l.partyKey === 'buyer')

  if (buyerLink) {
    const business = listing.business_name || 'the business'
    await sendEmail({
      to: buyerEmail,
      subject: `Please sign the NDA for ${business}`,
      html: `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:28px 20px">
  <div style="font-size:12px;letter-spacing:0.25em;color:#c9a84c;font-weight:800;margin-bottom:18px">CONCORD · DEAL PLATFORM</div>
  <h2 style="color:#1a1a2e;margin:0 0 6px">Review &amp; sign the NDA</h2>
  <p style="color:#666;font-size:13px;margin:0 0 18px">${esc(agencyName)} · Secure signing</p>
  <p style="color:#26303f;font-size:15px;line-height:1.6">Hi ${esc(buyerName)},</p>
  <p style="color:#26303f;font-size:15px;line-height:1.6">Before we share the confidential details of <strong>${esc(business)}</strong>, please review and sign the non-disclosure agreement using the secure link below:</p>
  <p style="margin:22px 0">
    <a href="${buyerLink.url}" style="display:inline-block;background:#1a1a2e;color:#c9a84c;padding:13px 26px;border-radius:8px;text-decoration:none;font-weight:800;font-size:15px">✍️ Sign the NDA</a>
  </p>
  <p style="color:#666;font-size:13px;line-height:1.6">Signing takes about a minute. Your signature, timestamp, and IP are recorded — electronic signatures are legally binding.</p>
  <p style="color:#aaa;font-size:11.5px;margin-top:26px">© 2026 ${esc(agencyName)} · Concord Deal Platform</p>
</div>`,
      kind: 'nda_request_received',
      meta: { documentId: doc.id, leadId: lead.id, listingId },
    }).catch(() => {})
  }

  // Qualify the lead in the funnel (NDA sent).
  await db.from('buyer_leads').update({ status: 'qualifying' }).eq('id', lead.id)

  return NextResponse.json({
    ok: true,
    documentId: doc.id,
    dealId,
    buyerUrl: buyerLink?.url || null,
    message: `NDA sent to ${buyerEmail} — they sign, then you approve from the NDAs page.`,
  }, { status: 201 })
}
