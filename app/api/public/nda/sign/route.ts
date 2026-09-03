/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import { generateNdaProfilePdf } from '@/lib/buyerFormPdf.server'
import { FF_BUCKET } from '@/lib/storageBuckets'
import { computeVisitorIntentScore, visitorRecencyWeight } from '@/lib/visitorIntent'
import {rateLimitAsync } from '@/lib/rateLimit'

// ---------------------------------------------------------------------------
// POST /api/public/nda/sign — accountless, per-listing NDA + Buyer Profile
// Form signature. Body: { listingId, name, email, guideAcknowledged,
// ndaFormData, buyerProfile }. Returns: { ok, token } — the token unlocks
// ONLY this listing's financials via GET /api/public/nda/financials. No
// login, no account, nothing else on the site is gated by this.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export async function POST(req: NextRequest) {
  // Anti-abuse: public endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const svc = createServerClient()
  if (!svc) return NextResponse.json({ ok: false, error: 'Not configured.' }, { status: 503 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const listingId = String(body?.listingId || '')
  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim()
  const visitorId = String(body?.visitorId || '').trim() || null
  const guideAcknowledged = body?.guideAcknowledged === true
  const ndaFormData = (body?.ndaFormData && typeof body.ndaFormData === 'object') ? body.ndaFormData : {}
  const buyerProfile = (body?.buyerProfile && typeof body.buyerProfile === 'object') ? body.buyerProfile : {}

  if (!listingId || !name || !email) {
    return NextResponse.json({ ok: false, error: 'Name, email, and listing are required.' }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!guideAcknowledged) {
    return NextResponse.json({ ok: false, error: 'Please confirm you have read the Buyer Forms Overview & Confidentiality Guide.' }, { status: 400 })
  }

  // Only a published listing can be NDA'd — the same gate the public feed uses.
  const { data: feed, error: listingErr } = await svc.rpc('get_public_listing_feed', { p_slug: listingId })
  const listingRow = Array.isArray(feed) ? feed[0] : null
  if (listingErr || !listingRow) {
    return NextResponse.json({ ok: false, error: 'Listing not found.' }, { status: 404 })
  }
  const listing = {
    id: listingRow.listing_id,
    business_name: listingRow.public_title || listingRow.business_name || null,
    industry: listingRow.industry,
    public_title: listingRow.public_title || null,
    location_general: listingRow.location_general || null,
    listing_ref: (listingRow as any)?.listing_ref || null,
  }

  const token = crypto.randomBytes(32).toString('hex')
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const userAgent = req.headers.get('user-agent') || null
  const signedAt = new Date().toISOString()

  // Generate the buyer's REAL Confidentiality Agreement + Buyer Profile Form
  // (his actual branded PDFs, filled in — not a re-typeset summary) for the
  // broker's records. Contains the buyer's home address, driver's
  // license/EIN, and net worth — goes in the private financial_docs bucket,
  // never the public one. pdf_url stores the storage PATH; the broker
  // dashboard resolves a signed URL on demand. Best-effort — a PDF failure
  // should never block the buyer's unlock.
  //
  // AGENCY TEMPLATE GATE (boss 08-31): when the listing's agency maintains its
  // own NDA template (document_templates, agency-scoped),
  // the buyer signs THAT fillable template (their name/info auto-populated,
  // rendered through the same shared PDF engine as the broker pack) instead of
  // the platform-default global PDF. Every agency owns its NDA language.
  let pdfPath: string | null = null
  try {
    const { data: agencyRow } = await svc.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
    const agencyIdForNda = (agencyRow as { agency_id?: string | null } | null)?.agency_id || null
    let agencyNdaTemplate: { name: string; body_template: string | null; fields: unknown[] } | null = null
    if (agencyIdForNda) {
      const { data: tpl } = await svc
        .from('document_templates')
        .select('name, body_template, fields')
        .eq('agency_id', agencyIdForNda)
        .ilike('name', '%nda%')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (tpl?.body_template) agencyNdaTemplate = tpl as typeof agencyNdaTemplate
    }

    let bytes: Uint8Array | null = null
    if (agencyNdaTemplate?.body_template) {
      // Render the AGENCY's fillable NDA template through the shared engine.
      const { buildDocumentPdfBase64 } = await import('@/lib/documentPdf.server')
      const b64 = await buildDocumentPdfBase64(
        {
          title: agencyNdaTemplate.name,
          body_template: agencyNdaTemplate.body_template,
          filled_data: {
            prospect_name: name,
            prospect_entity: String((buyerProfile as any)?.company || (ndaFormData as any)?.entity || ''),
            buyer_name: name,
            buyer_email: email,
            buyer_phone: String((buyerProfile as any)?.phone || (ndaFormData as any)?.phone || ''),
            buyer_address: String((buyerProfile as any)?.address || ''),
            business_name: listing.business_name || listing.public_title || 'the business',
            nda_date: signedAt.slice(0, 10),
            agency_name: 'The Brokerage',
            broker_name: 'Licensed Business Broker',
            confidentiality_period: '2',
            ...(ndaFormData as Record<string, unknown>),
          },
        },
        { agencyName: 'Business Brokerage', appUrl: process.env.NEXT_PUBLIC_APP_URL },
      )
      if (b64) bytes = new Uint8Array(Buffer.from(b64, 'base64'))
    }
    if (!bytes) {
      // Fallback: the platform default NDA PDF (existing behavior).
      bytes = await generateNdaProfilePdf({
        listingId,
        businessCategory: listing.industry,
        businessName: listing.public_title || listing.business_name || null,
        listingLocation: listing.location_general || null,
        listingRef: (listing as any)?.listing_ref || null,
        ndaFormData, buyerProfile, signerName: name, signedAt,
      })
    }

    const path = `nda-forms/${listingId}/${Date.now()}-${email.replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`
    const { error: upErr } = await svc.storage.from(FF_BUCKET).upload(path, Buffer.from(bytes), { contentType: 'application/pdf', upsert: false })
    if (!upErr) pdfPath = path
  } catch {
    /* non-fatal */
  }

  const { error: insErr } = await svc.from('listing_nda_signatures').insert({
    listing_id: listingId,
    buyer_name: name,
    buyer_email: email,
    unlock_token: token,
    ip_address: ip,
    user_agent: userAgent,
    nda_form_data: ndaFormData,
    buyer_profile: buyerProfile,
    guide_acknowledged: guideAcknowledged,
    pdf_url: pdfPath,
    qualification_score: body?.qualificationScore != null ? Number(body.qualificationScore) : null,
    qualification_decision: String(body?.qualificationDecision || '').trim() || null,
  })
  if (insErr) {
    return NextResponse.json({ ok: false, error: 'Could not record signature. Please try again.' }, { status: 500 })
  }

  // --- AUTO COUNTER-SIGN + ARCHIVE + BUYER COPY (best-effort, never blocks) ---
  try {
    const { data: listingRow } = await svc.from('listings').select('agency_id, agent_id, business_name').eq('id', listingId).maybeSingle()
    const agencyId = (listingRow as any)?.agency_id || null
    const agentId = (listingRow as any)?.agent_id || null
    // Counter-sign with the AGENT who owns/sends this listing's NDA — not a
    // generic agency identity. Boss's rule: my listing + I sent → my name &
    // title; another agent's listing → their name & title.
    let signer: { name: string; title: string } = { name: 'Broker', title: 'Licensed Business Broker' }
    if (agentId) {
      const { data: agent } = await svc.from('profiles').select('full_name, title').eq('id', agentId).maybeSingle()
      if (agent?.full_name) signer = { name: String(agent.full_name), title: String(agent.title || 'Business Advisor') }
    }
    if (agencyId && signer.name === 'Broker') {
      const { data: ag } = await svc.from('agencies').select('signing_name, signing_title').eq('id', agencyId).maybeSingle()
      if (ag?.signing_name) signer = { name: String(ag.signing_name), title: String(ag.signing_title || 'Broker') }
    }
    // 1) Mark the NDA row counter-signed with the agency's stored signature.
    await svc.from('listing_nda_signatures').update({
      counter_signed_at: new Date().toISOString(),
      counter_signer_name: signer.name,
      counter_signer_title: signer.title,
    }).eq('unlock_token', token)
    // 2) Archive a copy into the deal's documents (visible in the deal review).
    if (pdfPath) {
      try {
        await svc.from('listing_documents').insert({
          listing_id: listingId,
          category: 'nda',
          party_type: 'buyer',
          party_name: name,
          party_email: email,
          file_url: null,
          storage_path: pdfPath,
          signature_name: name,
          status: 'signed',
          signed_at: new Date().toISOString(),
        })
      } catch { /* archive is best-effort */ }
    }
    // 3) Email the buyer their signed copy (accountless unlock already works).
    const { notify } = await import('@/lib/email')
    await notify('nda_access_granted', email, {
      name,
      businessName: (listingRow as any)?.business_name || listing.business_name || listing.public_title || 'the business',
    }).catch(() => {})
  } catch {
    /* non-fatal */
  }

  // --- AGENT REVIEW → DATA-ROOM UNLOCK (boss 08-31, same flow as the broker
  // NDA request path) ---
  // The buyer's signature creates a PENDING data_room_access_request so the
  // agency's agent reviews it; approval grants the buyer a data-room record
  // (lib/ndaAccess.reviewNdaRequest → data_room_buyers). One NDA pipeline,
  // not a separate accountless side-path. Best-effort — financials unlock
  // via token still works immediately; the DATA ROOM waits for the agent.
  try {
    const { data: listingRow2 } = await svc.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
    const agencyId2 = (listingRow2 as { agency_id?: string | null } | null)?.agency_id || null
    let dataRoomId: string | null = null
    if (agencyId2) {
      const { data: room } = await svc
        .from('data_rooms')
        .select('id')
        .eq('listing_id', listingId)
        .eq('status', 'active')
        .maybeSingle()
      dataRoomId = room?.id || null
    }
    if (agencyId2) {
      await svc.from('data_room_access_requests').insert({
        agency_id: agencyId2,
        data_room_id: dataRoomId,
        listing_id: listingId,
        requester_name: name,
        requester_email: email,
        requester_company: String((buyerProfile as any)?.company || '').trim() || null,
        rationale: String((ndaFormData as any)?.rationale || '').trim() || null,
        nda_signature: name, // typed-name e-signature consent (same field as the broker NDA flow)
        ip_address: ip,
        status: 'pending',
      })
      // Alert the agency's brokers so the review queue is actionable.
      try {
        const { notifyAgencyBrokers } = await import('@/lib/ndaAccess')
        await notifyAgencyBrokers(agencyId2, listingId, {
          requesterName: name,
          requesterEmail: email,
          businessName: listing.business_name || listing.public_title || 'a listing',
        })
      } catch { /* alert best-effort */ }
    }
  } catch {
    /* review-request creation is best-effort — never blocks the signature */
  }

  // --- Funnel: NDA signer → CRM buyer lead (so brokers see who's signing). ---
  // Best-effort; a lead write failure never blocks the buyer's unlock.
  try {
    const profile = (buyerProfile || {}) as Record<string, unknown>
    const phone =
      String(profile.phone || profile.mobile || '').trim() ||
      String(ndaFormData.phone || ndaFormData.cell || '').trim() ||
      null
    const fundsRaw = String(profile.down_payment_amount || '').replace(/[$,]/g, '')
    const funds = fundsRaw ? Number(fundsRaw) || null : null
    const sba = String(profile.qualified_sba_loan || '').toLowerCase()
    const desired = String(profile.type_of_business_preferred || '').trim() || null
    const location = String(profile.location_preference || '').trim() || null

    // Upsert by email: enrich an existing lead, create a new one otherwise.
    const { data: existing } = await svc.from('buyer_leads').select('id').eq('email', email).maybeSingle()

    // Intent → lead score linkage: if the signer is an anonymous visitor we
    // tracked, fold their browsing intent (views, breadth, recency) into the
    // lead's record so brokers see how hot this buyer was before they signed.
    let intentNote = ''
    if (visitorId) {
      const { data: views } = await svc
        .from('listing_views')
        .select('listing_id, viewed_at')
        .eq('visitor_id', visitorId)
        .limit(5000)
      const viewRows = (views || []) as { listing_id: string; viewed_at: string }[]
      if (viewRows.length > 0) {
        const distinct = new Set(viewRows.map((v) => v.listing_id)).size
        const score = computeVisitorIntentScore(
          viewRows.map((v) => ({ viewedAtIso: v.viewed_at })),
          distinct,
        )
        intentNote = ` 👀 Intent ${score}/100 — ${viewRows.length} views across ${distinct} listing${distinct === 1 ? '' : 's'} before signing`
      }
    }

    const leadPayload: Record<string, unknown> = {
      full_name: name,
      email,
      phone,
      desired_business_type: desired || listing.industry || null,
      industry_interest: listing.industry || null,
      preferred_location: location,
      funds_available: funds,
      financing_method: sba === 'yes' ? 'SBA' : null,
      listing_id: listingId,
      source: 'nda_sign',
      notes: `Signed NDA for ${listing.business_name || 'a listing'} on ${signedAt.slice(0, 10)}` + intentNote,
      status: 'new',
    }
    if (existing) {
      await svc.from('buyer_leads').update(leadPayload).eq('id', existing.id)
    } else {
      const { data: listingAgency } = await svc.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
      await svc.from('buyer_leads').insert({ ...leadPayload, agency_id: listingAgency?.agency_id || null })
    }
  } catch {
    /* lead sync is best-effort */
  }

  return NextResponse.json({ ok: true, token })
}
