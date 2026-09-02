/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { notify } from '@/lib/email'
import { makeToken } from '@/lib/clientPortal'
import { trainingGateResponse } from '@/lib/trainingGate'

export const runtime = 'nodejs'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'

/**
 * POST /api/documents/send-for-signature — send a real signing request.
 * Body: { documentId }
 *
 * For each party on the document that has an email (seller/buyer), this:
 *   1. resolves the document's listing,
 *   2. finds (or creates) a deal for the listing,
 *   3. grants portal access + emails a branded portal link where the party
 *      reviews and signs by typing their full name (legally binding, audited),
 *   4. flips the document to pending_signature.
 *
 * One click = a real eSign request to the counterparty (no DocuSign/HelloSign
 * keys required — the portal is the signing surface).
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const documentId = String(body.documentId || '').trim()
  if (!documentId) return NextResponse.json({ ok: false, error: 'documentId is required' }, { status: 400 })

  // Load the document + its listing + parties.
  const { data: doc } = await db
    .from('documents')
    .select('*, listings(agency_id, business_name)')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) return NextResponse.json({ ok: false, error: 'document not found' }, { status: 404 })

  const agencyId = (doc.listings as any)?.agency_id
  const businessName = (doc.listings as any)?.business_name || doc.title || 'your deal'
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()
  const trainingBlock = await trainingGateResponse({ database: db, auth, agencyId, body, action: 'document_send_for_signature', targetType: 'document', targetId: documentId })
  if (trainingBlock) return trainingBlock

  const listingId = doc.listing_id
  if (!listingId) {
    return NextResponse.json({ ok: false, error: 'Document is not linked to a listing — link it first.' }, { status: 400 })
  }

  // Resolve a deal for the listing (portal is deal-scoped). Reuse the first
  // deal if one exists; otherwise create a minimal deal shell.
  const { data: existingDeal } = await db.from('deals').select('id').eq('listing_id', listingId).maybeSingle()
  let dealId = existingDeal?.id || null
  if (!dealId) {
    const { data: created, error: dealErr } = await db
      .from('deals')
      .insert({ listing_id: listingId, status: 'letter_of_intent' })
      .select('id')
      .single()
    if (dealErr || !created) {
      return NextResponse.json({ ok: false, error: dealErr?.message || 'Could not create a deal for this listing' }, { status: 500 })
    }
    dealId = created.id
  }

  // Parties that still need to sign and have an email to reach them at.
  const parties = Array.isArray(doc.parties) ? doc.parties : []
  const recipients: { name: string; email: string; role: string }[] = []
  for (const p of parties) {
    const email = String(p?.email || '').trim()
    const role = String(p?.role || '').trim()
    if (email.includes('@') && (role === 'seller' || role === 'buyer')) {
      recipients.push({ name: String(p?.name || '').trim() || email, email, role })
    }
  }
  // Also include any signature slots that carry an email (even if the parties
  // array is sparse) — covers docs generated before party emails were stored.
  const { data: sigSlots } = await db.from('document_signatures').select('party_name, party_email, role').eq('document_id', documentId)
  for (const s of sigSlots || []) {
    const email = String(s?.party_email || '').trim()
    const role = String(s?.role || '').trim()
    if (email.includes('@') && (role === 'seller' || role === 'buyer') && !recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
      recipients.push({ name: String(s?.party_name || '').trim() || email, email, role })
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, error: 'No signer emails on this document — add seller/buyer emails first.' }, { status: 400 })
  }

  // Grant portal access + email a branded signing link to each recipient.
  const sent: { name: string; email: string; portalUrl: string }[] = []
  for (const r of recipients) {
    const token = makeToken()
    const { error: accessErr } = await db.from('client_portal_access').insert({
      deal_id: dealId,
      client_name: r.name,
      client_email: r.email.toLowerCase(),
      token,
    })
    if (accessErr) continue // skip this recipient, keep going
    const portalUrl = `${APP_URL}/portal/${dealId}/${token}`
    await notify('portal_invite', r.email, {
      clientName: r.name,
      portalUrl,
      dealTitle: businessName,
    }).catch(() => {})
    sent.push({ name: r.name, email: r.email, portalUrl })
  }

  if (sent.length === 0) {
    return NextResponse.json({ ok: false, error: 'Could not grant portal access — check the recipient emails.' }, { status: 500 })
  }

  // Flip the document to pending_signature (the portal only shows docs in
  // pending_signature / signed state).
  await db.from('documents').update({ status: 'pending_signature', updated_at: new Date().toISOString() }).eq('id', documentId)

  return NextResponse.json({
    ok: true,
    status: 'pending_signature',
    dealId,
    sent: sent.map((s) => ({ name: s.name, email: s.email, portalUrl: s.portalUrl })),
    message: `Signing links sent to ${sent.length} recipient${sent.length === 1 ? '' : 's'} — they sign by opening the email link.`,
  }, { status: 201 })
}
