/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/documentSigning.ts — accountless signing links for legal documents.
// -----------------------------------------------------------------------------
// Broker sends a document (listing agreement, NDA, LOI…) to the SELLER and/or
// BUYER. Each party gets a private, token-gated link — no login needed. They
// open it, see the filled document, and sign with the in-app signature pad
// (typed name or drawn signature). When ALL parties have signed, the executed
// PDF is generated, saved to the documents bucket, and the document flips to
// 'signed' — so legal records are auto-archived, exactly like a real e-sign
// service, with zero DocuSign dependency.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ezbusinessadvisors.vercel.app'

function svc() {
  return SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null
}

export interface SigningParty {
  key: string
  label: string
  role: string
  name?: string | null
  email?: string | null
  title?: string | null
}

export interface DocumentRow {
  id: string
  title: string
  body_template?: string | null
  content?: string | null
  filled_data?: Record<string, unknown> | null
  parties?: SigningParty[] | null
  status?: string
}

/** Create one signing link per party; returns the links (with tokens). */
export async function createSigningLinks(documentId: string, parties: SigningParty[], ttlHours = 168): Promise<{ ok: boolean; links?: Array<{ partyKey: string; token: string; url: string }>; error?: string }> {
  const db = svc()
  if (!db) return { ok: false, error: 'not configured' }

  const links: Array<{ partyKey: string; token: string; url: string }> = []
  for (const party of parties) {
    if (!party.email) continue
    const token = cryptoRandomToken()
    const { error } = await db.from('document_signing_links').insert({
      document_id: documentId,
      party_key: party.key,
      party_name: party.name || null,
      party_email: party.email,
      token,
      status: 'pending',
      expires_at: new Date(Date.now() + ttlHours * 3600000).toISOString(),
    })
    if (error) return { ok: false, error: error.message }
    links.push({ partyKey: party.key, token, url: `${APP_URL}/sign/${token}` })
  }
  return { ok: true, links }
}

/** Resolve a signing link token → document + party (or null). */
export async function resolveSigningToken(token: string): Promise<{ ok: boolean; link?: any; document?: DocumentRow; party?: SigningParty; error?: string } | null> {
  const db = svc()
  if (!db) return null
  const { data: link } = await db.from('document_signing_links').select('*').eq('token', token).maybeSingle()
  if (!link) return { ok: false, error: 'Link not found' }
  if (link.status === 'expired' || (link.expires_at && new Date(link.expires_at) < new Date())) {
    return { ok: false, error: 'Link expired — ask the broker for a new one.' }
  }
  const { data: doc } = await db.from('documents').select('id, title, template_id, filled_data, parties, status').eq('id', link.document_id).maybeSingle()
  if (!doc) return { ok: false, error: 'Document not found' }
  // The document body lives on the TEMPLATE (via template_id), not on the
  // documents row — fetch it so the sign page can render the filled text.
  let body = ''
  if (doc.template_id) {
    const { data: tpl } = await db.from('document_templates').select('body_template').eq('id', doc.template_id).maybeSingle()
    body = tpl?.body_template || ''
  }
  const parties = (doc.parties || []) as SigningParty[]
  const party = parties.find((p) => p.key === link.party_key) || { key: link.party_key, label: 'Signer', role: 'custom' }
  return { ok: true, link, document: { ...doc, body_template: body } as DocumentRow, party }
}

/** Mark a party's link signed (draw/type signature). */
export async function completeSigning(
  token: string,
  signature: { name: string; mode: 'draw' | 'type'; dataUrl?: string; title?: string | null },
): Promise<{ ok: boolean; allSigned: boolean; documentId?: string; error?: string }> {
  const db = svc()
  if (!db) return { ok: false, allSigned: false, error: 'not configured' }

  const { data: link } = await db.from('document_signing_links').select('*').eq('token', token).maybeSingle()
  if (!link) return { ok: false, allSigned: false, error: 'Link not found' }
  if (link.status === 'signed') return { ok: false, allSigned: false, error: 'Already signed.' }

  const { error: upErr } = await db.from('document_signing_links').update({
    status: 'signed',
    signed_at: new Date().toISOString(),
    party_name: signature.name,
  }).eq('id', link.id)
  if (upErr) return { ok: false, allSigned: false, error: upErr.message }

  // Record the signature in the document_signatures table (audit trail).
  // Role is derived from the party (seller/buyer/broker) so publish gates
  // (sellerApprovalState) can find the seller's signed agreement.
  const partyKey = link.party_key
  const sigRole = partyKey === 'seller' || partyKey === 'buyer' || partyKey === 'broker' ? partyKey : 'custom'
  await db.from('document_signatures').upsert({
    document_id: link.document_id,
    party_key: partyKey,
    party_name: signature.name,
    party_title: signature.title || null,
    party_email: link.party_email,
    role: sigRole,
    status: 'signed',
    signature_data: { mode: signature.mode, dataUrl: signature.dataUrl || null, title: signature.title || null, signedAt: new Date().toISOString() },
    signed_at: new Date().toISOString(),
  }, { onConflict: 'document_id,party_key' }).maybeSingle()

  // All parties signed? Flip the document to signed.
  const { data: remaining } = await db.from('document_signing_links').select('id').eq('document_id', link.document_id).neq('status', 'signed')
  const allSigned = !remaining || remaining.length === 0
  if (allSigned) {
    await db.from('documents').update({ status: 'signed', esign_status: 'completed', esign_completed_at: new Date().toISOString() }).eq('id', link.document_id)
  }

  return { ok: true, allSigned, documentId: link.document_id }
}

function cryptoRandomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
