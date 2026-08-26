/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { renderTemplateBody } from '@/lib/documentBuilder'

export const runtime = 'nodejs'

/**
 * GET /api/documents/bundle?listingId=...&download=1
 * Signed-pack PDF export — bundles every legal document for a listing
 * (filled body + signature status + audit trail) into ONE branded PDF.
 * Broker-authorized only; returns the PDF inline or as attachment.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const listingId = req.nextUrl.searchParams.get('listingId') || ''
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId is required' }, { status: 400 })

  const { data: listing } = await db.from('listings').select('id, agency_id, business_name').eq('id', listingId).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
  if (!canManageAgency(authenticated, listing.agency_id)) return forbiddenResponse()

  // Gather docs + their signatures + audit trail.
  const { data: docs } = await db
    .from('documents')
    .select('*, document_templates(name, category, body_template, fields)')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: true })
  if (!docs?.length) return NextResponse.json({ ok: false, error: 'No documents for this listing' }, { status: 404 })

  const docIds = docs.map((d) => d.id)
  const [sigsRes, auditRes] = await Promise.all([
    db.from('document_signatures').select('*').in('document_id', docIds).order('created_at', { ascending: true }),
    db.from('document_audit_logs').select('*').in('document_id', docIds).order('created_at', { ascending: false }).limit(100),
  ])

  const sigsByDoc = new Map<string, any[]>()
  for (const s of sigsRes.data || []) {
    if (!sigsByDoc.has(s.document_id)) sigsByDoc.set(s.document_id, [])
    sigsByDoc.get(s.document_id)!.push(s)
  }

  // --- Render the PDF (jsPDF, navy/gold branded like CIM/BOV) ---------------
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 56
  const NAVY: [number, number, number] = [26, 26, 46]
  const GOLD: [number, number, number] = [201, 168, 76]
  const INK: [number, number, number] = [43, 43, 58]
  const MUTED: [number, number, number] = [122, 122, 138]

  let y = 0
  const ensure = (needed: number) => {
    if (y + needed > H - 60) { doc.addPage(); y = 48 }
  }

  // Cover page.
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, H, 'F')
  doc.setFillColor(...GOLD)
  doc.rect(0, H - 8, W, 8, 'F')
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('CONCORD DEAL PLATFORM', M, 90)
  doc.setTextColor(255, 255, 255)
  doc.setFont('times', 'bold')
  doc.setFontSize(30)
  doc.text('Signed Deal Pack', M, 150)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(220, 220, 230)
  doc.text(listing.business_name || 'Business Sale', M, 180)
  doc.text(`Listing ID: ${listingId.slice(0, 8)}`, M, 205)
  doc.text(`${docs.length} legal document${docs.length === 1 ? '' : 's'} · generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, M, 230)
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('E-SIGNATURE PACKAGE — ELECTRONIC SIGNATURES ARE LEGALLY BINDING', M, 290)
  doc.setTextColor(200, 200, 210)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('This package contains the executed legal documents for this transaction,', M, 310)
  doc.text('including signature status and the full audit trail. Governing law: Commonwealth of', M, 326)
  doc.text('Pennsylvania. Venue: Dauphin County, Pennsylvania.', M, 342)
  doc.addPage()
  y = 48

  // Summary table.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...NAVY)
  doc.text('Package summary', M, y); y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  doc.text(`Business: ${listing.business_name || '—'}`, M, y); y += 16
  doc.text(`Documents: ${docs.length}`, M, y); y += 16
  doc.text(`Audit events: ${(auditRes.data || []).length}`, M, y); y += 16
  const totalSigs = (sigsRes.data || []).length
  const signedSigs = (sigsRes.data || []).filter((s) => s.status === 'signed').length
  doc.text(`Signatures: ${signedSigs}/${totalSigs} collected`, M, y); y += 28

  // Per-document sections.
  for (const d of docs) {
    const tpl = d.document_templates as any
    const title = tpl?.name || d.title || 'Document'
    const sigs = sigsByDoc.get(d.id) || []
    const allSigned = sigs.length > 0 && sigs.every((s) => s.status === 'signed')

    ensure(120)
    doc.setFillColor(247, 246, 242)
    doc.rect(M - 8, y - 14, W - 2 * M + 16, 34, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...NAVY)
    doc.text(`${allSigned ? '✅ ' : '📄 '}${title}`, M, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(`${tpl?.category || ''} · status: ${d.status?.replace(/_/g, ' ') || 'draft'}`, M, y + 12)
    y += 44

    // Filled body (plain text).
    const body = renderTemplateBody(tpl?.body_template || '', (d.filled_data || {}) as Record<string, unknown>)
    if (body) {
      doc.setFont('courier', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...INK)
      const lines = doc.splitTextToSize(body, W - 2 * M)
      for (const line of lines) {
        ensure(11)
        doc.text(String(line), M, y)
        y += 11
      }
      y += 10
    }

    // Signature slots.
    if (sigs.length) {
      ensure(20 + sigs.length * 26)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...GOLD)
      doc.text('Signature status', M, y); y += 18
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      for (const s of sigs) {
        ensure(26)
        const signed = s.status === 'signed'
        doc.setTextColor(...INK)
        doc.text(`${s.party_name || s.party_key || 'Party'} — ${signed ? 'SIGNED' : (s.status || 'unsigned').toUpperCase()}`, M, y)
        if (signed && s.signed_at) {
          doc.setTextColor(...MUTED)
          doc.text(`  on ${new Date(s.signed_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, M + 150, y)
        }
        y += 26
      }
      y += 8
    }
  }

  // Audit trail page.
  const audit = auditRes.data || []
  if (audit.length) {
    doc.addPage()
    y = 48
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...NAVY)
    doc.text('Audit trail', M, y); y += 24
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    for (const a of audit.slice(0, 60)) {
      ensure(14)
      const when = a.created_at ? new Date(a.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : ''
      const detail = a.detail ? JSON.stringify(a.detail).slice(0, 80) : ''
      doc.text(`${when}  ·  ${a.action}${detail ? `  ·  ${detail}` : ''}`, M, y)
      y += 14
    }
  }

  // Footer disclaimer.
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('Prepared confidentially by the Concord Deal Platform. Electronic signatures are valid under the ESIGN Act and Pennsylvania law.', M, H - 30)

  const pdfBytes = doc.output('arraybuffer')
  const download = req.nextUrl.searchParams.get('download') === '1'
  const filename = `${(listing.business_name || 'deal-pack').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-signed-pack.pdf`
  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
}
