/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// SHARED DOCUMENT PDF RENDERER
// -----------------------------------------------------------------------------
// Builds the branded PDF for a filled document from its body_template. This is
// the SINGLE renderer used by:
//   * POST /api/documents/esign (send for signature)
//   * scripts/make-sample-doc.mjs and friends (sample previews for the owner)
// so a sample preview is byte-for-byte what ships.
//
// Renders: branded letterhead (agency logo + name + gold rule), centered
// document title, an optional boxed DEAL SUMMARY table (between ======
// dividers), clause-aware body paragraphs, and a SIGNATURES block with
// per-party name + contact/credential lines. Footer on every page.
// =============================================================================

export interface DocPdfInput {
  title?: string | null
  body_template?: string | null
  content?: string | null
  filled_data?: Record<string, unknown> | null
  parties?: Array<{
    key?: string
    role?: string
    label?: string
    name?: string | null
    email?: string | null
    license?: string | null
    phone?: string | null
    title?: string | null
  }>
}

export interface DocPdfOpts {
  agencyName: string
  agencyLogoUrl?: string | null
  appUrl?: string
}

/** Render a filled document body into branded PDF bytes (base64). */
export async function buildDocumentPdfBase64(doc: DocPdfInput, opts: DocPdfOpts): Promise<string> {
  // Inline copy of renderTemplateBody (lib/documentBuilder.ts) — kept here so
  // this module stays node-runnable for sample scripts (documentBuilder pulls
  // in the supabase client, which only resolves inside Next.js).
  const renderTemplateBody = (body: string | null, filled: Record<string, unknown>): string => {
    if (!body) return ''
    const rendered = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
      const v = filled[key]
      if (v == null || v === '') return `[${key}]`
      return String(v)
    })
    return rendered.replace(/\{\{\s*([^}\s]+)[^}]*\}\}/g, (_, key: string) => String(filled[key] ?? key))
  }
  const raw = renderTemplateBody(doc.body_template || doc.content || '', doc.filled_data || {})
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .trim()
  // Drop a leading title line that duplicates the document title (the PDF
  // renders its own centered title block).
  let text = raw
    .replace(new RegExp('^' + (doc.title || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n*', 'i'), '')
    .replace(/^\(Non-Disclosure Agreement\)\s*\n*/i, '')
    .replace(/^Effective Date:.*\n+/i, '')
    .trim()

  const jsPdfMod: any = await import('jspdf')
  // Works under both Next.js (ESM default) and plain node (CJS interop).
  const jsPDF = jsPdfMod.default?.jsPDF || jsPdfMod.default || jsPdfMod.jsPDF
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 56
  const agencyName = opts.agencyName

  // --- Letterhead: logo (when fetchable) + agency name + gold rule ----------
  let logoBase64: string | null = null
  try {
    const logoPath = opts.agencyLogoUrl && opts.agencyLogoUrl.startsWith('/')
      ? opts.agencyLogoUrl
      : '/brand/ez-business-advisors.jpg'
    const base = opts.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'
    const res = await fetch(`${base}${logoPath}`, { cache: 'no-store' })
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
  pdf.setFont('times', 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(120, 120, 120)
  pdf.text(`Prepared by ${agencyName}`, M, 104)
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
  const parties = doc.parties || []
  if (parties.length > 0) {
    const blockNeeds = 24 + 26 + parties.length * 40 + 20
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
      const lines: string[] = []
      if (p.email && p.email.trim()) lines.push(p.email)
      if (p.role === 'agent') {
        const lic = p.license && p.license.trim() ? `License: ${p.license}` : ''
        const ph = p.phone && p.phone.trim() ? `Tel: ${p.phone}` : ''
        const ttl = p.title && p.title.trim() ? p.title : ''
        const cred = [ttl, lic, ph].filter(Boolean).join(' · ')
        if (cred) lines.push(cred)
      }
      let infoY = y + 10
      for (const line of lines) {
        pdf.setFontSize(8.5)
        pdf.setTextColor(138, 134, 120)
        pdf.text(pdf.splitTextToSize(line, lineLen - 10).join(' '), nameX, infoY)
        infoY += 10
      }
      pdf.setFontSize(11)
      pdf.setDrawColor(120, 120, 120)
      pdf.setLineWidth(0.8)
      pdf.line(nameX, y + 2, nameX + lineLen, y + 2)
      y += 40
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

  return Buffer.from(pdf.output('arraybuffer')).toString('base64')
}
