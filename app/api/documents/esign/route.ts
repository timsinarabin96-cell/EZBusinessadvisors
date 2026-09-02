/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createEsignRequest, esignConfigured, type EsignParty } from '@/lib/eSign'
import { trainingGateResponse } from '@/lib/trainingGate'

export const runtime = 'nodejs'

// =============================================================================
// POST /api/documents/esign — send a document for electronic signature.
// Body: { documentId, parties: [{name,email,role}] }
//   * Loads the filled document (PDF export from the document builder).
//   * Sends via DocuSign or HelloSign when configured; records the provider
//     signature request id on the document so status can be tracked.
//   * Returns signing URL for embedded signing, or not_configured to fall
//     back to the in-app signature pad.
// =============================================================================

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const documentId = String(body.documentId || '').trim()
  const parties = Array.isArray(body.parties) ? (body.parties as EsignParty[]) : []
  if (!documentId || parties.length === 0) {
    return NextResponse.json({ ok: false, error: 'documentId and at least one party are required' }, { status: 400 })
  }
  for (const p of parties) {
    if (!p.name || !p.email || !p.email.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Each party needs a name and valid email' }, { status: 400 })
    }
  }

  const { data: doc } = await db.from('documents').select('*, listings(agency_id), document_templates(body_template)').eq('id', documentId).maybeSingle()
  if (!doc) return NextResponse.json({ ok: false, error: 'document not found' }, { status: 404 })
  // The document body lives on the TEMPLATE (template_id), not on the
  // documents row — the joined body_template powers the PDF render below.
  if (doc.document_templates?.body_template) {
    doc.body_template = doc.document_templates.body_template
  }
  const agencyId = doc.listings?.agency_id
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()
  const trainingBlock = await trainingGateResponse({ database: db, auth, agencyId, body, action: 'document_esign', targetType: 'document', targetId: documentId })
  if (trainingBlock) return trainingBlock

  // Agency brand for the letterhead — each agency's own logo shows on its docs
  // (white-label ready), and the preparing agent's name is printed beneath.
  let agencyName = process.env.NEXT_PUBLIC_AGENCY_NAME || 'EZ Business Advisors'
  let agencyLogoUrl: string | null = null
  let agentName: string | null = null
  try {
    const { data: ag } = await db.from('agencies').select('name, logo_url').eq('id', agencyId).maybeSingle()
    if (ag?.name) agencyName = ag.name
    if (ag?.logo_url) agencyLogoUrl = ag.logo_url
  } catch { /* fall back to defaults */ }
  const docParties = (doc.parties || []) as Array<{ key?: string; role?: string; name?: string | null }>
  const agentParty = docParties.find((p) => p.role === 'agent')
  if (agentParty?.name) agentName = agentParty.name

  const configured = esignConfigured()
  if (!configured) {
    return NextResponse.json({ ok: false, error: 'eSign is not configured yet', code: 'ESIGN_NOT_CONFIGURED' }, { status: 503 })
  }

  // Build the PDF from the filled document using the SHARED renderer
  // (lib/documentPdf.server.ts) — the same code that powers sample previews,
  // so what the owner approves is byte-for-byte what ships.
  let contentBase64 = ''
  try {
    const { buildDocumentPdfBase64 } = await import('@/lib/documentPdf.server')
    contentBase64 = await buildDocumentPdfBase64(doc as never, {
      agencyName,
      agencyLogoUrl,
    })
  } catch {
    // Fall through to text-based content below.
  }
  if (!contentBase64) {
    contentBase64 = Buffer.from(doc.content || doc.title || 'Document').toString('base64')
  }

  const result = await createEsignRequest({
    document: { name: doc.title || 'Document', contentBase64, fileType: 'application/pdf' },
    parties,
    subject: body.subject || `Please sign: ${doc.title || 'Document'}`,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason || 'eSign request failed' }, { status: 500 })
  }

  // Record the provider request id on the document for status tracking.
  if (result.signatureRequestId) {
    void (async () => {
      try {
        await db.from('documents').update({
          esign_provider: result.provider,
          esign_request_id: result.signatureRequestId,
          esign_status: 'sent',
          esign_sent_at: new Date().toISOString(),
        }).eq('id', documentId)
      } catch { /* non-critical */ }
    })()
  }

  return NextResponse.json({
    ok: true,
    provider: result.provider,
    signatureRequestId: result.signatureRequestId,
    signingUrl: result.signingUrl || null,
  })
}
