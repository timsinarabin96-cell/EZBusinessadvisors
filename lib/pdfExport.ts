import { jsPDF } from 'jspdf'
import type { CimContent } from '@/lib/cim'
import type { BovContent } from '@/lib/bov'
import type { RecastResult, RecastYearResult } from '@/lib/recast'

// ---------------------------------------------------------------------------
// PDF export for CIM, BOV and Recast reports with the gold/navy investment-
// bank aesthetic. Uses jsPDF with manual layout (cover page, gold rules, navy
// headings) to avoid heavy HTML-to-PDF dependencies.
// ---------------------------------------------------------------------------

const NAVY: [number, number, number] = [26, 26, 46]
const GOLD: [number, number, number] = [201, 168, 76]
const GOLD_DARK: [number, number, number] = [168, 135, 47]
const CREAM: [number, number, number] = [247, 246, 242]
const TEXT: [number, number, number] = [43, 43, 58]
const MUTED: [number, number, number] = [122, 122, 138]

export function exportCimToPdf(content: CimContent): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth() // 595
  const H = doc.internal.pageSize.getHeight() // 842
  const M = 56 // margin

  // ---- Cover page ----
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, H, 'F')
  // gold rule
  doc.setFillColor(...GOLD)
  doc.rect(0, H * 0.42, W, 2.5, 'F')

  doc.setTextColor(...GOLD)
  doc.setFont('times', 'bold')
  doc.setFontSize(30)
  let y = H * 0.5
  doc.text(content.title, M, y)

  doc.setTextColor(255, 255, 255)
  doc.setFont('times', 'normal')
  doc.setFontSize(18)
  y += 34
  doc.text(content.subtitle, M, y)

  doc.setFontSize(11)
  doc.setTextColor(...GOLD)
  y += 30
  doc.text('CONFIDENTIAL INFORMATION MEMORANDUM', M, y)

  doc.setFontSize(10)
  doc.setTextColor(200, 200, 200)
  y += 26
  doc.text(`Prepared: ${content.generatedAt}`, M, y)

  doc.setFontSize(10)
  y += 18
  doc.text('CONCORD DEAL PLATFORM', M, y)

  doc.addPage()

  // ---- Table of contents ----
  doc.setTextColor(...NAVY)
  doc.setFont('times', 'bold')
  doc.setFontSize(20)
  doc.text('Table of Contents', M, 80)
  doc.setFillColor(...GOLD)
  doc.rect(M, 92, 60, 2.5, 'F')

  doc.setFont('times', 'normal')
  doc.setFontSize(12)
  let ty = 130
  for (const s of content.sections) {
    doc.setTextColor(...NAVY)
    doc.text(s.title, M, ty)
    ty += 24
  }

  // ---- Sections ----
  for (const section of content.sections) {
    doc.addPage()
    // navy header band
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, W, 90, 'F')
    doc.setTextColor(...GOLD)
    doc.setFont('times', 'bold')
    doc.setFontSize(16)
    doc.text(section.title, M, 55)

    let sy = 130
    for (const sub of section.subsections) {
      doc.setTextColor(...NAVY)
      doc.setFont('times', 'bold')
      doc.setFontSize(13)
      doc.text(sub.heading, M, sy)
      sy += 22
      doc.setFont('times', 'normal')
      doc.setFontSize(10.5)
      doc.setTextColor(...TEXT)
      for (const line of sub.body) {
        // word-wrap within margins
        const wrapped = doc.splitTextToSize(line, W - M * 2) as string[]
        for (const w of wrapped) {
          if (sy > H - 60) {
            doc.addPage()
            sy = 60
          }
          doc.text(w, M, sy)
          sy += 16
        }
        sy += 6
      }
      sy += 10
    }
  }

  // ---- Disclaimer (final page) ----
  doc.addPage()
  doc.setTextColor(...NAVY)
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.text('Confidentiality', M, 80)
  doc.setFillColor(...GOLD)
  doc.rect(M, 92, 60, 2, 'F')
  doc.setFont('times', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...MUTED)
  const disc = doc.splitTextToSize(
    'This document is confidential and proprietary to the seller and its advisor. It is provided solely for the purpose of evaluating a potential transaction and may not be reproduced, distributed, or used for any other purpose without the prior written consent of the seller. Recipients agree to maintain the confidentiality of the information contained herein and to use it solely to evaluate an acquisition of the subject business. This memorandum does not constitute an offer to sell. Information is provided "as is" without warranty of accuracy or completeness.',
    W - M * 2
  ) as string[]
  let dy = 110
  for (const l of disc) {
    doc.text(l, M, dy)
    dy += 15
  }

  doc.save(`${content.title.replace(/[^a-z0-9]+/gi, '_')}_CIM_v1.pdf`)
}

export function exportBovToPdf(content: BovContent): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 56

  // Header band
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 100, 'F')
  doc.setTextColor(...GOLD)
  doc.setFont('times', 'bold')
  doc.setFontSize(16)
  doc.text('BROKER OPINION OF VALUE', M, 48)
  doc.setFontSize(12)
  doc.setTextColor(255, 255, 255)
  doc.text(content.title, M, 72)

  doc.setFillColor(...GOLD)
  doc.rect(0, 100, W, 2.5, 'F')

  let y = 140

  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text('Valuation Summary', M, y)
  y += 20

  const rows: [string, string][] = [
    ['Business', content.businessName],
    ['Asking Price', fmt(content.askingPrice)],
    ['Annual Revenue', fmt(content.revenue)],
    ['SDE', fmt(content.sde)],
    ['EBITDA', fmt(content.ebitda)],
    ['Price / Revenue', content.revenueMultiple],
    ['Price / SDE', content.sdeMultiple],
    ['Price / EBITDA', content.ebitdaMultiple],
    ['Indicative Value Range', content.valuationRange],
  ]

  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  for (const [k, v] of rows) {
    doc.setTextColor(...TEXT)
    doc.text(k, M, y)
    doc.setTextColor(...GOLD_DARK)
    doc.setFont('times', 'bold')
    doc.text(v, W - M, y, { align: 'right' })
    doc.setFont('times', 'normal')
    y += 20
  }

  // Conclusion
  y += 16
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text('Conclusion', M, y)
  y += 20
  doc.setFont('times', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...TEXT)
  const concl = doc.splitTextToSize(content.conclusion, W - M * 2) as string[]
  for (const l of concl) {
    doc.text(l, M, y)
    y += 16
  }

  // Comparables table
  y += 24
  doc.addPage()
  y = 80
  doc.setTextColor(...NAVY)
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.text('Comparable Transactions', M, y)
  y += 20

  // Table headers
  doc.setFillColor(...NAVY)
  doc.rect(M, y - 12, W - M * 2, 20, 'F')
  doc.setTextColor(...GOLD)
  doc.setFont('times', 'bold')
  doc.setFontSize(10)
  const cols = ['Business', 'Industry', 'Location', 'Price', 'Revenue', 'Multiple']
  const colX = [M, M + 110, M + 210, M + 320, M + 420, M + 500]
  for (let i = 0; i < cols.length; i++) doc.text(cols[i], colX[i], y)
  y += 24

  doc.setTextColor(...TEXT)
  doc.setFont('times', 'normal')
  doc.setFontSize(10)
  for (const c of content.comparables) {
    const vals = [c.business, c.industry, c.location, fmt(c.price), fmt(c.revenue), c.multiple ? c.multiple.toFixed(2) + 'x' : 'N/A']
    for (let i = 0; i < vals.length; i++) doc.text(vals[i], colX[i], y)
    y += 20
    if (y > 760) { doc.addPage(); y = 60 }
  }

  // Assumptions
  y += 20
  doc.setTextColor(...NAVY)
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.text('Assumptions & Methodology', M, y)
  y += 20
  doc.setFont('times', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...TEXT)
  for (const a of content.assumptions) {
    const lines = doc.splitTextToSize('•  ' + a, W - M * 2) as string[]
    for (const l of lines) {
      if (y > 780) { doc.addPage(); y = 60 }
      doc.text(l, M, y)
      y += 15
    }
  }

  // Disclaimer
  y += 20
  doc.setFont('times', 'italic')
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  const disc = doc.splitTextToSize('Disclaimer: ' + content.disclaimer, W - M * 2) as string[]
  for (const l of disc) {
    if (y > 790) { doc.addPage(); y = 60 }
    doc.text(l, M, y)
    y += 14
  }

  doc.save(`${content.businessName.replace(/[^a-z0-9]+/gi, '_')}_BOV.pdf`)
}

const fmt = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '$—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

// ---------------------------------------------------------------------------
// Recast Financial Report PDF export
// ---------------------------------------------------------------------------
const fmtR = (n: number | null | undefined, currency = '$'): string => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  const sign = n < 0 ? '-' : ''
  return `${currency}${sign}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function exportRecastToPdf(result: RecastResult): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth() // 595
  const H = doc.internal.pageSize.getHeight() // 842
  const M = 56 // margin

  // ---- Cover page ----
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, H, 'F')
  doc.setFillColor(...GOLD)
  doc.rect(0, H * 0.42, W, 2.5, 'F')

  doc.setTextColor(...GOLD)
  doc.setFont('times', 'bold')
  doc.setFontSize(28)
  let y = H * 0.5
  doc.text(result.businessName || 'Recast Report', M, y)

  doc.setTextColor(255, 255, 255)
  doc.setFont('times', 'normal')
  doc.setFontSize(16)
  y += 30
  doc.text('Recasted Financial Statement', M, y)

  doc.setFontSize(11)
  doc.setTextColor(...GOLD)
  y += 28
  doc.text('NORMALIZED SDE / EBITDA ANALYSIS', M, y)

  doc.setFontSize(10)
  doc.setTextColor(200, 200, 200)
  y += 26
  doc.text(`Entity Type: ${result.entityType.toUpperCase().replace('_', '-')}`, M, y)
  y += 16
  doc.text(`Fiscal Periods Covered: ${result.years.length}`, M, y)
  y += 16
  doc.text(`Prepared: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`, M, y)

  doc.setTextColor(...GOLD)
  doc.setFontSize(9)
  y = H - 60
  doc.text('CONCORD DEAL PLATFORM', M, y)
  doc.text('CONFIDENTIAL', W - M, y, { align: 'right' })

  // ---- Page 2: Executive summary metrics ----
  doc.addPage()
  y = 80
  doc.setTextColor(...NAVY)
  doc.setFont('times', 'bold')
  doc.setFontSize(16)
  doc.text('Recast Summary', M, y)
  y += 14
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(2)
  doc.line(M, y, M + 60, y)
  y += 30

  // Metric boxes
  const boxes = [
    { label: 'Average SDE', value: fmtR(result.avgSDE, result.currency), sub: "Seller's Discretionary Earnings" },
    { label: 'Average EBITDA', value: fmtR(result.avgEBITDA, result.currency), sub: 'Earnings Before Interest, Tax, D&A' },
  ]
  const boxW = (W - M * 2 - 24) / 2
  boxes.forEach((b, i) => {
    const bx = M + i * (boxW + 24)
    doc.setDrawColor(...GOLD)
    doc.setFillColor(250, 249, 244)
    doc.roundedRect(bx, y, boxW, 88, 6, 6, 'FD')
    doc.setTextColor(...NAVY)
    doc.setFont('times', 'bold')
    doc.setFontSize(11)
    doc.text(b.label, bx + 14, y + 22)
    doc.setTextColor(...GOLD_DARK)
    doc.setFontSize(18)
    doc.text(b.value, bx + 14, y + 50)
    doc.setTextColor(...MUTED)
    doc.setFont('times', 'normal')
    doc.setFontSize(9)
    doc.text(b.sub, bx + 14, y + 70)
  })

  y += 120
  doc.setTextColor(...NAVY)
  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.text('Earnings Trend', M, y)
  y += 18
  doc.setFont('times', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...TEXT)
  const trend = doc.splitTextToSize(result.trendNote, W - M * 2) as string[]
  for (const l of trend) {
    doc.text(l, M, y)
    y += 16
  }

  // ---- Before vs After table ----
  y += 24
  doc.addPage()
  y = 80
  doc.setTextColor(...NAVY)
  doc.setFont('times', 'bold')
  doc.setFontSize(16)
  doc.text('Before vs After — Recast Comparison', M, y)
  y += 14
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(2)
  doc.line(M, y, M + 60, y)
  y += 26

  const yearsSorted = result.years.slice().sort((a, b) => b.year - a.year)
  const rows: { label: string; key: (yr: RecastYearResult) => string; highlight?: boolean; gold?: boolean }[] = [
    { label: 'Revenue', key: (yr) => fmtR(yr.recast.revenue, result.currency), highlight: true },
    { label: 'As-Reported Net Income', key: (yr) => fmtR(yr.asReported.netIncome, result.currency) },
    { label: '+ Total Add-backs', key: (yr) => '+' + fmtR(yr.totalAddBacks, result.currency), gold: true },
    { label: 'Recast SDE', key: (yr) => fmtR(yr.recast.sde, result.currency), highlight: true, gold: true },
    { label: 'Recast EBITDA', key: (yr) => fmtR(yr.recast.ebitda, result.currency), highlight: true },
  ]

  // Header
  doc.setFillColor(...NAVY)
  doc.rect(M, y - 12, W - M * 2, 22, 'F')
  doc.setTextColor(...GOLD)
  doc.setFont('times', 'bold')
  doc.setFontSize(10)
  doc.text('Metric', M + 10, y)
  const yearStart = M + 130
  const colW = (W - M * 2 - 130) / yearsSorted.length
  yearsSorted.forEach((yr, i) => {
    doc.text(yr.label, yearStart + i * colW + colW / 2, y, { align: 'center' })
  })
  y += 28

  rows.forEach((r, ri) => {
    if (ri % 2 === 1 && !r.highlight) {
      doc.setFillColor(247, 246, 242)
      doc.rect(M, y - 12, W - M * 2, 22, 'F')
    }
    if (r.gold) {
      doc.setFillColor(250, 243, 225)
      doc.rect(M, y - 12, W - M * 2, 22, 'F')
    }
    doc.setTextColor(...NAVY)
    doc.setFont('times', r.highlight ? 'bold' : 'normal')
    doc.setFontSize(10)
    doc.text(r.label, M + 10, y)
    doc.setTextColor(...(r.gold ? GOLD_DARK : TEXT))
    yearsSorted.forEach((yr, i) => {
      doc.text(r.key(yr), yearStart + i * colW + colW / 2, y, { align: 'center' })
    })
    y += 24
    if (y > 780) { doc.addPage(); y = 60 }
  })

  // ---- Add-back detail ----
  y += 20
  doc.setTextColor(...NAVY)
  doc.setFont('times', 'bold')
  doc.setFontSize(14)
  doc.text('Add-Back Detail', M, y)
  y += 14
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(2)
  doc.line(M, y, M + 60, y)
  y += 24

  doc.setFont('times', 'normal')
  doc.setFontSize(9.5)
  for (const yr of yearsSorted) {
    doc.setTextColor(...NAVY)
    doc.setFont('times', 'bold')
    doc.text(`${yr.label} — Total Add-backs: ${fmtR(yr.totalAddBacks, result.currency)}`, M, y)
    y += 16
    doc.setFont('times', 'normal')
    for (const d of yr.addBackDetail) {
      if (y > 780) { doc.addPage(); y = 60 }
      doc.setTextColor(...TEXT)
      doc.text('•  ' + d.label, M + 8, y)
      doc.setTextColor(...GOLD_DARK)
      doc.text('+' + fmt(d.amount), W - M, y, { align: 'right' })
      y += 16
    }
    if (yr.addBackDetail.length === 0) {
      doc.setTextColor(...MUTED)
      doc.setFont('times', 'italic')
      doc.text('No add-backs recorded for this period.', M + 8, y)
      doc.setFont('times', 'normal')
      y += 16
    }
    y += 10
    if (y > 760) { doc.addPage(); y = 60 }
  }

  // ---- Disclaimer ----
  y += 20
  doc.setTextColor(...MUTED)
  doc.setFont('times', 'italic')
  doc.setFontSize(9.5)
  const disc2 = doc.splitTextToSize(
    'Disclaimer: This recast is an estimate prepared for business-valuation purposes and may not reflect GAAP financial statements. ' +
    'Add-backs are subject to buyer and lender verification. Figures include owner compensation, non-recurring, discretionary and ' +
    'non-arm\'s-length adjustments as standard industry practice for SDE/EBITDA normalization.',
    W - M * 2
  ) as string[]
  for (const l of disc2) {
    if (y > 790) { doc.addPage(); y = 60 }
    doc.text(l, M, y)
    y += 14
  }

  doc.save(`${result.businessName.replace(/[^a-z0-9]+/gi, '_')}_Recast_Report.pdf`)
}
