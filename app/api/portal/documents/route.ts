/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SVC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SVC = SVC_URL && SVC_KEY ? createClient(SVC_URL, SVC_KEY, { auth: { persistSession: false } }) : null

// Letterhead brand fallback — platform brand when the agency has no logo set.
const DEFAULT_BRAND = { agencyName: 'EZ Business Advisors', logoUrl: null }

// =============================================================================
// /api/portal/documents — two-sided fillable agreements for portal clients.
// -----------------------------------------------------------------------------
// Token-gated (same client_portal_access token as the portal itself). Lets a
// buyer/seller SEE the fillable documents for their deal, FILL the fields,
// and SIGN their party's signature slot. The broker completes their side in
// the dashboard. When every party has signed, the document flips to 'signed'.
//
//   GET  /api/portal/documents?dealId=…&token=…
//        → { ok, client: { name, email, partyKey }, documents: [...] }
//   POST /api/portal/documents  { dealId, token, action }
//        action 'fill': { documentId, filledData }
//        action 'sign': { documentId, partyKey, name }
// =============================================================================

async function resolveClient(dealId: string, token: string) {
  if (!SVC) return null
  const { data } = await SVC
    .from('client_portal_access')
    .select('*')
    .eq('deal_id', dealId)
    .eq('token', token)
    .eq('status', 'active')
    .maybeSingle()
  return data || null
}

export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get('dealId') || ''
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!dealId || !token) return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400 })
  if (!SVC) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const access = await resolveClient(dealId, token)
  if (!access) return NextResponse.json({ ok: false, error: 'invalid or revoked link' }, { status: 404 })

  // Deal → listing → documents (fillable agreements live under the listing).
  const { data: deal } = await SVC.from('deals').select('id, listing_id, title').eq('id', dealId).maybeSingle()
  const listingId = (deal as { listing_id?: string | null } | null)?.listing_id || null
  if (!listingId) return NextResponse.json({ ok: true, client: { name: access.client_name, email: access.client_email, partyKey: null }, brand: DEFAULT_BRAND, documents: [] })

  // Agency brand for the letterhead (logo + name). Falls back to the platform brand.
  const { data: listingRow } = await SVC.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
  let brand: { agencyName: string; logoUrl: string | null } = DEFAULT_BRAND
  const agencyId = (listingRow as { agency_id?: string | null } | null)?.agency_id
  if (agencyId) {
    const { data: ag } = await SVC.from('agencies').select('name, logo_url').eq('id', agencyId).maybeSingle()
    if (ag) brand = { agencyName: ag.name || DEFAULT_BRAND.agencyName, logoUrl: ag.logo_url || null }
  }

  const { data: docs } = await SVC
    .from('documents')
    .select('*, document_templates(body_template, name, category)')
    .eq('listing_id', listingId)
    .in('status', ['pending_signature', 'signed'])
    .order('created_at', { ascending: true })

  const clientEmail = String(access.client_email || '').toLowerCase()
  const clientName = String(access.client_name || '')

  const documents: any[] = []
  for (const doc of docs || []) {
    const parties = (doc.parties || []) as Array<{ key: string; label: string; role: string; name: string | null; email: string | null }>
    // The client's party: match by email, else first buyer/seller role, else first party.
    let partyKey: string | null = null
    const byEmail = parties.find((p) => p.email && p.email.toLowerCase() === clientEmail)
    if (byEmail) partyKey = byEmail.key
    if (!partyKey) {
      const byRole = parties.find((p) => p.role === 'buyer' || p.role === 'seller')
      partyKey = byRole?.key || parties[0]?.key || null
    }

    const { data: sigs } = await SVC
      .from('document_signatures')
      .select('*')
      .eq('document_id', doc.id)
      .order('created_at', { ascending: true })

    documents.push({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      template_id: doc.template_id,
      template_name: (doc as any).document_templates?.name || null,
      body_template: (doc as any).document_templates?.body_template || null,
      filled_data: doc.filled_data || {},
      parties,
      partyKey,
      signatures: sigs || [],
      allSigned: (sigs || []).length > 0 && (sigs || []).every((s: any) => s.status === 'signed'),
    })
  }

  return NextResponse.json({ ok: true, client: { name: clientName, email: access.client_email, partyKey: null }, brand, documents })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { dealId, token, action } = body
  if (!dealId || !token || !action) return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400 })
  if (!SVC) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const access = await resolveClient(dealId, token)
  if (!access) return NextResponse.json({ ok: false, error: 'invalid or revoked link' }, { status: 404 })

  const clientEmail = String(access.client_email || '').toLowerCase()

  if (action === 'fill') {
    const { documentId, filledData } = body
    if (!documentId || !filledData || typeof filledData !== 'object') {
      return NextResponse.json({ ok: false, error: 'documentId + filledData required' }, { status: 400 })
    }
    const { data: doc } = await SVC.from('documents').select('*').eq('id', documentId).maybeSingle()
    if (!doc) return NextResponse.json({ ok: false, error: 'document not found' }, { status: 404 })
    // Only allow filling documents that are pending signature (not yet signed).
    if (doc.status !== 'pending_signature') {
      return NextResponse.json({ ok: false, error: 'document is not open for filling' }, { status: 400 })
    }
    const merged = { ...(doc.filled_data || {}), ...filledData }
    await SVC.from('documents').update({ filled_data: merged, updated_at: new Date().toISOString() }).eq('id', documentId)
    return NextResponse.json({ ok: true, filled_data: merged })
  }

  if (action === 'sign') {
    const { documentId, partyKey, name } = body
    if (!documentId || !partyKey || !name || !String(name).trim()) {
      return NextResponse.json({ ok: false, error: 'documentId + partyKey + name required' }, { status: 400 })
    }
    const { data: doc } = await SVC.from('documents').select('*').eq('id', documentId).maybeSingle()
    if (!doc) return NextResponse.json({ ok: false, error: 'document not found' }, { status: 404 })

    // Verify the requested party belongs to this client (or is buyer/seller role).
    const parties = (doc.parties || []) as Array<{ key: string; role: string; email: string | null }>
    const party = parties.find((p) => p.key === partyKey)
    if (!party) return NextResponse.json({ ok: false, error: 'unknown party' }, { status: 400 })
    const emailMatch = party.email && party.email.toLowerCase() === clientEmail
    const roleOk = party.role === 'buyer' || party.role === 'seller'
    if (!emailMatch && !roleOk) {
      return NextResponse.json({ ok: false, error: 'you cannot sign for this party' }, { status: 403 })
    }

    const { data: sigs } = await SVC
      .from('document_signatures')
      .select('*')
      .eq('document_id', documentId)
      .eq('party_key', partyKey)
    const sig = (sigs || [])[0]
    if (!sig) return NextResponse.json({ ok: false, error: 'signature slot not found' }, { status: 404 })
    if (sig.status === 'signed') {
      return NextResponse.json({ ok: true, already: true, message: 'Already signed' })
    }

    await SVC
      .from('document_signatures')
      .update({
        status: 'signed',
        party_name: String(name).trim(),
        party_email: access.client_email || party.email,
        signature_data: { name: String(name).trim(), source: 'portal', ts: new Date().toISOString() },
        signed_at: new Date().toISOString(),
      })
      .eq('id', sig.id)

    // All parties signed → document status flips to 'signed'.
    const { data: allSigs } = await SVC.from('document_signatures').select('status').eq('document_id', documentId)
    if ((allSigs || []).length > 0 && (allSigs || []).every((s: any) => s.status === 'signed')) {
      await SVC.from('documents').update({ status: 'signed', updated_at: new Date().toISOString() }).eq('id', documentId)
    }

    return NextResponse.json({ ok: true, message: 'Signature recorded' })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
