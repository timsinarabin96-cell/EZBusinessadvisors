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

  const { data: doc } = await db.from('documents').select('*, listings(agency_id)').eq('id', documentId).maybeSingle()
  if (!doc) return NextResponse.json({ ok: false, error: 'document not found' }, { status: 404 })
  const agencyId = doc.listings?.agency_id
  if (!agencyId || !canManageAgency(auth, agencyId)) return forbiddenResponse()

  const configured = esignConfigured()
  if (!configured) {
    return NextResponse.json({ ok: false, error: 'eSign is not configured yet', code: 'ESIGN_NOT_CONFIGURED' }, { status: 503 })
  }

  // Build the PDF from the filled document using jsPDF (already a dependency).
  // Branded letterhead: logo + agency name + gold rule, then the full body,
  // signature lines, and a footer — so the exported PDF reads like a real
  // executed agreement, not plain text.
  let contentBase64 = ''
  try {
    const { renderTemplateBody } = await import('@/lib/documentBuilder')
    const text = renderTemplateBody(doc.body_template || doc.content || '', doc.filled_data || {})
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const { default: jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
    const W = pdf.internal.pageSize.getWidth()
    const H = pdf.internal.pageSize.getHeight()
    const M = 56

    // --- Letterhead: logo (when fetchable) + agency name + gold rule ----------
    const agencyName = process.env.NEXT_PUBLIC_AGENCY_NAME || 'EZ Business Advisors'
    let logoBase64: string | null = null
    try {
      const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'}/brand/ez-business-advisors.jpg`
      const res = await fetch(logoUrl, { cache: 'no-store' })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        logoBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`
      }
    } catch { /* logo is decorative — proceed without it */ }

    if (logoBase64) {
      try {
        pdf.addImage(logoBase64, 'JPEG', M, 40, 150, 50)
      } catch { /* ignore malformed image */ }
    } else {
      pdf.setFont('times', 'bold')
      pdf.setFontSize(17)
      pdf.setTextColor(26, 26, 46)
      pdf.text(agencyName, M, 60)
    }
    // Gold rule under the letterhead
    pdf.setFillColor(201, 168, 76)
    pdf.rect(M, 108, W - M * 2, 3, 'F')

    // --- Document title -------------------------------------------------------
    pdf.setFont('times', 'bold')
    pdf.setFontSize(16)
    pdf.setTextColor(26, 26, 46)
    pdf.text(pdf.splitTextToSize(doc.title || 'Document', W - M * 2), W / 2, 140, { align: 'center' })

    // --- Body -----------------------------------------------------------------
    pdf.setFont('times', 'normal')
    pdf.setFontSize(12)
    pdf.setTextColor(35, 43, 58)
    const lines = pdf.splitTextToSize(text || doc.title || 'Document', W - M * 2)
    let y = 170
    for (const line of lines) {
      if (y > H - M - 20) { pdf.addPage(); y = M + 20 }
      pdf.text(line, M, y)
      y += 16
    }

    // --- Signature lines ------------------------------------------------------
    const parties = (doc.parties || []) as Array<{ key?: string; label?: string; role?: string; name?: string | null }>
    if (parties.length > 0) {
      if (y + 40 > H - M - 20) { pdf.addPage(); y = M + 20 }
      y += 24
      pdf.setFont('times', 'bold')
      pdf.setFontSize(11)
      pdf.setTextColor(26, 26, 46)
      pdf.text('SIGNATURES', M, y)
      pdf.setFont('times', 'normal')
      pdf.setFontSize(11)
      y += 22
      for (const p of parties) {
        if (y > H - M - 20) { pdf.addPage(); y = M + 20 }
        pdf.setTextColor(35, 43, 58)
        pdf.text(p.label || p.role || 'Party', M, y)
        pdf.setTextColor(120, 120, 120)
        pdf.text(p.name || '_____________________________', M + 180, y)
        y += 24
      }
    }

    // --- Footer ---------------------------------------------------------------
    pdf.setFontSize(9)
    pdf.setTextColor(138, 134, 120)
    pdf.text(`Generated by ${agencyName} via Concord Deal Platform · Electronic signature is legally binding`, W / 2, H - 30, { align: 'center' })

    contentBase64 = Buffer.from(pdf.output('arraybuffer')).toString('base64')
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
