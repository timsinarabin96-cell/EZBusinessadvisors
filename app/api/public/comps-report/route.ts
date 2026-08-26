/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextResponse } from 'next/server'
import { buildSoldCompsReport } from '@/lib/soldComps'

export const runtime = 'nodejs'

/**
 * GET /api/public/comps-report — free branded market-report PDF.
 * Renders the live sold-comps report (industry multiples, prices, days to
 * sell) into a navy/gold PDF sellers can keep — the free teaser that funnels
 * into the paid Sellable Reports.
 */
export async function GET() {
  const report = await buildSoldCompsReport()

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 56
  const NAVY: [number, number, number] = [26, 26, 46]
  const GOLD: [number, number, number] = [201, 168, 76]
  const INK: [number, number, number] = [43, 43, 58]
  const MUTED: [number, number, number] = [122, 122, 138]
  const fmt$ = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

  // Cover.
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
  doc.text('Business Market Report', M, 150)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(220, 220, 230)
  doc.text('Anonymized sale multiples and prices by industry', M, 185)
  doc.text(`Compiled ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, M, 210)
  doc.setTextColor(...GOLD)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Confidential · No business names or owners disclosed', M, 260)
  doc.addPage()

  let y = 48
  const ensure = (needed: number) => { if (y + needed > H - 60) { doc.addPage(); y = 48 } }

  // Totals band.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...NAVY)
  doc.text('Market snapshot', M, y); y += 26
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  const rows: [string, string][] = [
    ['Deals tracked', String(report.totals.deals)],
    ['Average multiple', report.totals.avgMultiple != null ? `${report.totals.avgMultiple.toFixed(2)}× SDE` : '—'],
    ['Average sale price', fmt$(report.totals.avgSalePrice)],
    ['Industries covered', String(report.totals.industries)],
  ]
  for (const [k, v] of rows) {
    doc.setTextColor(...MUTED)
    doc.text(k, M, y)
    doc.setTextColor(...INK)
    doc.text(v, M + 220, y)
    y += 20
  }
  y += 16

  // Industry table.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...NAVY)
  doc.text('Multiples by industry', M, y); y += 22

  const colX = [M, M + 120, M + 200, M + 300, M + 400]
  doc.setFillColor(...NAVY)
  doc.rect(M - 6, y - 12, W - 2 * M + 12, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('INDUSTRY', colX[0], y)
  doc.text('DEALS', colX[1], y)
  doc.text('MULTIPLE', colX[2], y)
  doc.text('AVG PRICE', colX[3], y)
  doc.text('MEDIAN', colX[4], y)
  y += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  for (const i of report.industries.slice(0, 40)) {
    ensure(18)
    doc.setTextColor(...INK)
    doc.text(String(i.industry).slice(0, 22), colX[0], y)
    doc.text(String(i.count), colX[1], y)
    doc.text(i.avgMultiple != null ? `${i.avgMultiple.toFixed(2)}×` : '—', colX[2], y)
    doc.text(fmt$(i.avgSalePrice), colX[3], y)
    doc.text(fmt$(i.medianSalePrice), colX[4], y)
    y += 18
  }

  // States.
  if (report.states.length) {
    y += 14
    ensure(120)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...NAVY)
    doc.text('Where deals are closing', M, y); y += 24
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    for (const s of report.states.slice(0, 20)) {
      ensure(16)
      doc.text(`${s.state} — ${s.count} deal${s.count === 1 ? '' : 's'}${s.avgMultiple != null ? ` · ${s.avgMultiple.toFixed(2)}× avg` : ''}`, M, y)
      y += 16
    }
  }

  // Footer CTA.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...GOLD)
  doc.text('Want a valuation for YOUR business? Get a confidential estimate.', M, H - 60)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text('Prepared by the Concord Deal Platform. Market data is anonymized and provided for general information only — not an appraisal.', M, H - 30)

  const pdfBytes = doc.output('arraybuffer')
  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="concord-market-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
      'cache-control': 'no-store',
    },
  })
}
