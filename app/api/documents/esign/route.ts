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

  // Build the PDF from the filled document using jsPDF (already a dependency).
  // Branded letterhead: logo + agency name + gold rule, then the full body,
  // signature lines, and a footer — so the exported PDF reads like a real
  // executed agreement, not plain text.
  let contentBase64 = ''
  try {
    const { renderTemplateBody } = await import('@/lib/documentBuilder')
    const raw = renderTemplateBody(doc.body_template || doc.content || '', doc.filled_data || {})
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r\n?/g, '\n')
      .trim()
    // Drop a leading title line that duplicates the document title (the PDF
    // renders its own centered title block).
    // Drop the title + any leading subtitle lines ((Non-Disclosure Agreement),
    // standalone Effective Date line) that duplicate the PDF's own title block.
    let text = raw
      .replace(new RegExp('^' + (doc.title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n*', 'i'), '')
      .replace(/^\(Non-Disclosure Agreement\)\s*\n*/i, '')
      .replace(/^Effective Date:.*\n+/i, '')
      .trim()
    const { default: jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
    const W = pdf.internal.pageSize.getWidth()
    const H = pdf.internal.pageSize.getHeight()
    const M = 56

    // --- Letterhead: logo (when fetchable) + agency name + gold rule ----------
    let logoBase64: string | null = null
    try {
      const logoPath = agencyLogoUrl && agencyLogoUrl.startsWith('/')
        ? agencyLogoUrl
        : '/brand/ez-business-advisors.jpg'
      const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'}${logoPath}`
      const res = await fetch(logoUrl, { cache: 'no-store' })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        logoBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`
      }
    } catch { /* logo is decorative — proceed without it */ }

    if (logoBase64) {
      try {
        pdf.addImage(logoBase64, 'JPEG', M, 34, 165, 55)
      } catch { /* ignore malformed image */ }
    } else {
      pdf.setFont('times', 'bold')
      pdf.setFontSize(17)
      pdf.setTextColor(26, 26, 46)
      pdf.text(agencyName, M, 60)
    }
    // Agency-only prepared-by line — agents identify themselves in the
    // signature block at the bottom, not on the letterhead.
    pdf.setFont('times', 'normal')
    pdf.setFontSize(9.5)
    pdf.setTextColor(120, 120, 120)
    pdf.text(`Prepared by ${agencyName}`, M, 104)
    // Gold rule under the letterhead
    pdf.setFillColor(201, 168, 76)
    pdf.rect(M, 108, W - M * 2, 3, 'F')

    // --- Document title -------------------------------------------------------
    pdf.setFont('times', 'bold')
    pdf.setFontSize(16)
    pdf.setTextColor(26, 26, 46)
    pdf.text(pdf.splitTextToSize(doc.title || 'Document', W - M * 2), W / 2, 140, { align: 'center' })

    // --- Body (paragraph-aware: preserves template line breaks) ---------------
    const fmtMoney = (s: string) =>
      s.replace(/\$(\d+)/g, (_, n) => '$' + Number(n).toLocaleString('en-US'))
    // Extract the DEAL SUMMARY block (between the ==== dividers) FIRST so it is
    // rendered as a boxed table, then the remaining paragraphs flow normally.
    const summaryMatch = text.match(/^=+\s*DEAL SUMMARY\s*=\s*([\s\S]*?)\s*^=+$/m)
    const summaryRows: Array<[string, string]> = []
    let bodyText = text
    if (summaryMatch) {
      const block = summaryMatch[1]
      bodyText = text.replace(summaryMatch[0], '').trim()
      for (const line of block.split('\n')) {
        const idx = line.indexOf(':')
        if (idx <= 0) continue
        const label = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim()
        if (label && value) summaryRows.push([label, fmtMoney(value)])
      }
    }
    const paragraphs = bodyText.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim().replace(/\s{2,}/g, ' ')).filter(Boolean)
    let y = 170
    // DEAL SUMMARY box (when present)
    if (summaryRows.length > 0) {
      const labelX = M + 10
      const valueX = M + 200
      const valueW = W - M * 2 - 210
      const rowLines = summaryRows.map(([, value]) => pdf.splitTextToSize(value, valueW).length)
      const totalLines = rowLines.reduce((a, b) => a + b, 0)
      const boxH = totalLines * 15 + 26
      if (y + boxH > H - M - 20) { pdf.addPage(); y = M + 30 }
      pdf.setFillColor(245, 243, 236)
      pdf.setDrawColor(201, 168, 76)
      pdf.setLineWidth(1.2)
      pdf.roundedRect(M, y - 14, W - M * 2, boxH, 4, 4, 'FD')
      pdf.setFont('times', 'bold')
      pdf.setFontSize(10.5)
      pdf.setTextColor(26, 26, 46)
      pdf.text('DEAL SUMMARY', labelX, y)
      pdf.setFont('times', 'normal')
      pdf.setFontSize(10.5)
      y += 16
      for (let r = 0; r < summaryRows.length; r++) {
        const [label, value] = summaryRows[r]
        pdf.setTextColor(26, 26, 46)
        pdf.text(label + ':', labelX, y)
        const isCommission = /commission/i.test(label)
        pdf.setFont('times', isCommission ? 'bold' : 'normal')
        pdf.setTextColor(isCommission ? 150 : 60, isCommission ? 110 : 60, isCommission ? 30 : 60)
        const valueLines = pdf.splitTextToSize(value, valueW)
        pdf.text(valueLines, valueX, y)
        pdf.setFont('times', 'normal')
        y += rowLines[r] * 15
      }
      y += 16
    }
    for (const para of paragraphs) {
      // Clause paragraphs: heading ("1. ENGAGEMENT.") bold navy, body regular.
      const clauseMatch = para.match(/^(\d+\.\s+[A-Z][A-Z &;,'\-]*?\.)\s*/)
      const hasClause = !!clauseMatch
      if (hasClause) {
        const heading = clauseMatch![1]
        const rest = para.slice(clauseMatch![0].length)
        pdf.setFont('times', 'bold')
        pdf.setFontSize(12)
        pdf.setTextColor(26, 26, 46)
        const headLines = pdf.splitTextToSize(heading, W - M * 2)
        if (y + headLines.length * 15 + 10 > H - M - 20 && y > 200) { pdf.addPage(); y = M + 30 }
        for (const line of headLines) {
          if (y > H - M - 20) { pdf.addPage(); y = M + 30 }
          pdf.text(line, M, y)
          y += 15
        }
        if (rest.trim()) {
          pdf.setFont('times', 'normal')
          pdf.setFontSize(12)
          pdf.setTextColor(35, 43, 58)
          const bodyLines = pdf.splitTextToSize(fmtMoney(rest.trim()), W - M * 2)
          if (y + bodyLines.length * 15 + 10 > H - M - 20 && y > 200) { pdf.addPage(); y = M + 30 }
          for (const line of bodyLines) {
            if (y > H - M - 20) { pdf.addPage(); y = M + 30 }
            pdf.text(line, M, y)
            y += 15
          }
        }
        y += 9
      } else {
        pdf.setFont('times', 'normal')
        pdf.setFontSize(12)
        pdf.setTextColor(35, 43, 58)
        const lines = pdf.splitTextToSize(fmtMoney(para), W - M * 2)
        if (y + lines.length * 15 + 10 > H - M - 20 && y > 200) { pdf.addPage(); y = M + 30 }
        for (const line of lines) {
          if (y > H - M - 20) { pdf.addPage(); y = M + 30 }
          pdf.text(line, M, y)
          y += 15
        }
        y += 9
      }
    }

    // --- Signature lines ------------------------------------------------------
    // Agents put their full name + contact info here (bottom of the document);
    // the letterhead stays pure agency brand.
    const parties = (doc.parties || []) as Array<{ key?: string; label?: string; role?: string; name?: string | null; email?: string | null }>
    if (parties.length > 0) {
      const blockNeeds = 24 + 26 + parties.length * 34 + 20
      // Keep the whole signature block together on one page.
      if (y + blockNeeds > H - M - 20) { pdf.addPage(); y = M + 30 }
      y += 24
      pdf.setFont('times', 'bold')
      pdf.setFontSize(11)
      pdf.setTextColor(26, 26, 46)
      pdf.text('SIGNATURES', M, y)
      pdf.setFont('times', 'normal')
      pdf.setFontSize(11)
      y += 26
      const nameX = M + 190
      const lineLen = Math.min(230, W - nameX - M - 10)
      for (const p of parties) {
        pdf.setTextColor(35, 43, 58)
        pdf.text(p.label || p.role || 'Party', M, y)
        pdf.setTextColor(70, 70, 70)
        const shown = p.name && p.name.trim() ? p.name : 'Signed'
        const clipped = pdf.splitTextToSize(shown, lineLen - 10).join(' ')
        pdf.text(clipped, nameX, y - 6)
        // Contact info under the agent's name (email), truncated to the line.
        const info = p.email && p.email.trim() ? p.email : ''
        if (info) {
          pdf.setFontSize(9)
          pdf.setTextColor(138, 134, 120)
          pdf.text(pdf.splitTextToSize(info, lineLen - 10).join(' '), nameX, y + 10)
          pdf.setFontSize(11)
        }
        // Actual underline beneath the name — consistent for every row.
        pdf.setDrawColor(120, 120, 120)
        pdf.setLineWidth(0.8)
        pdf.line(nameX, y + 2, nameX + lineLen, y + 2)
        y += 34
      }
    }

    // --- Footer on EVERY page --------------------------------------------------
    const totalPages = pdf.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p)
      pdf.setFont('times', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(138, 134, 120)
      pdf.text(`Generated by ${agencyName} via Concord Deal Platform · Electronic signature is legally binding`, W / 2, H - 30, { align: 'center' })
      pdf.setFontSize(8)
      pdf.text(String(p), W - M, H - 30)
    }

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
