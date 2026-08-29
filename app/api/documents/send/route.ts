/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { createSigningLinks, type SigningParty } from '@/lib/documentSigning'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/documents/send — send a filled document for signature to the
 * SELLER and/or BUYER (accountless signing links, no login needed).
 * body: { documentId, subject?, message? }
 *   Uses the document's stored parties (with emails). Each party gets a
 *   private link; when ALL parties sign, the executed PDF is archived and
 *   the document flips to 'signed'.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const documentId = String(body.documentId || '').trim()
  if (!documentId) return NextResponse.json({ ok: false, error: 'documentId required' }, { status: 400 })

  const { data: doc } = await db.from('documents').select('*, listings(agency_id)').eq('id', documentId).maybeSingle()
  if (!doc) return NextResponse.json({ ok: false, error: 'document not found' }, { status: 404 })

  const agencyId = doc.listings?.agency_id
  const memberOfAgency = agencyId ? auth.memberships.some((m) => m.agency_id === agencyId) : false
  if (!memberOfAgency) return NextResponse.json({ ok: false, error: 'Not a member of this listing agency' }, { status: 403 })

  const parties = (doc.parties || []) as SigningParty[]
  const signable = parties.filter((p) => p.email)
  if (!signable.length) {
    return NextResponse.json({ ok: false, error: 'No party emails on this document — add seller/buyer emails first' }, { status: 400 })
  }

  const res = await createSigningLinks(documentId, signable)
  if (!res.ok || !res.links?.length) {
    return NextResponse.json({ ok: false, error: res.error || 'Failed to create signing links' }, { status: 500 })
  }

  // Email each party their private signing link.
  const subject = body.subject || `Please sign: ${doc.title || 'Document'}`
  const message = body.message || 'A broker has sent you a document to review and sign. Follow the link below — no account needed.'
  let sent = 0
  for (const link of res.links) {
    const party = signable.find((p) => p.key === link.partyKey)
    if (!party?.email) continue
    await sendEmail({
      to: party.email,
      subject,
      html: `<h2 style="margin:0 0 12px;font-family:Georgia,serif;">📄 ${subject}</h2>
        <p style="font-size:14px;line-height:1.6;color:#444;">${message}</p>
        <p style="margin:18px 0;"><a href="${link.url}" style="display:inline-block;background:#0e7490;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">✍️ Review &amp; Sign Document</a></p>
        <p style="font-size:13px;color:#888;">This link is private to you (${party.email}) and expires in 7 days. Signing is legally binding and timestamped.</p>`,
      kind: 'generic',
    }).catch(() => {})
    sent++
  }

  await db.from('documents').update({ esign_status: 'sent', esign_sent_at: new Date().toISOString() }).eq('id', documentId)

  return NextResponse.json({ ok: true, sent, links: res.links.map((l) => ({ partyKey: l.partyKey, url: l.url })) })
}
