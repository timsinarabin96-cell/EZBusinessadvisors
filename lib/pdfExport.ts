// =============================================================================
// PDF export for CIM, BOV, Recast and BLI reports — Open Claw theme.
// Near-black pages (#0B0C10), institutional gold (#C9A84C), teal data accents
// (#45A29E), Playfair Display headlines + Inter body. Agency footer pulled
// from the agencies table. Layout engine lives in lib/pdfOpenClaw.ts.
// =============================================================================

import { jsPDF } from 'jspdf'
import type { CimContent } from '@/lib/cim'
import type { BovContent } from '@/lib/bov'
import type { RecastResult, RecastYearResult } from '@/lib/recast'
import type { BliContent } from '@/lib/bli'
import {
  CLAW_GOLD,
  CLAW_GOLD_DARK,
  CLAW_TEAL,
  CLAW_BODY,
  CLAW_MUTED,
  CLAW_ROW_A,
  CLAW_ROW_B,
  type DocAgency,
  type ClawFonts,
  registerClawFonts,
  setHead,
  setBody,
  clawFooter,
  clawPageBg,
  clawWatermark,
  clawRule,
  clawTable,
  type ClawTableCol,
  clawCover,
} from '@/lib/pdfOpenClaw'

export interface PdfOpts {
  returnBytes?: boolean
  agency?: DocAgency | null
}

const M = 56 // page margin (pt)
const A4_H = 841.89
const CONTENT_W = 595.28 - M * 2

const fmt = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '$—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
const fmtR = (n: number | null | undefined, currency = '$'): string => {
  if (n === null || n === undefined || isNaN(n)) return '—'
  const sign = n < 0 ? '-' : ''
  return `${currency}${sign}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

/** Start a themed content page: dark bg, gold rule + title band, footer. */
function clawSectionPage(doc: jsPDF, fonts: ClawFonts, agency: DocAgency | null | undefined, title: string): number {
  const W = doc.internal.pageSize.getWidth()
  doc.addPage()
  clawPageBg(doc)
  clawFooter(doc, agency, fonts)
  // header band
  doc.setDrawColor(...CLAW_GOLD)
  doc.setLineWidth(2.5)
  doc.line(0, 0, W, 0)
  setHead(doc, fonts, 17, 1)
  doc.setTextColor(...CLAW_GOLD)
  const lines = doc.splitTextToSize(title, CONTENT_W) as string[]
  let y = 64
  for (const l of lines) {
    doc.text(l, M, y)
    y += 24
  }
  clawRule(doc, y + 6)
  return y + 34
}

/** Body paragraph renderer with auto-pagination. */
function clawBody(doc: jsPDF, fonts: ClawFonts, agency: DocAgency | null | undefined, heading: string | null, body: string[], y: number, pageTitle: string): number {
  const W = doc.internal.pageSize.getWidth()
  if (heading) {
    setHead(doc, fonts, 12.5, 0.5)
    doc.setTextColor(...CLAW_TEAL)
    doc.text(heading, M, y)
    y += 18
  }
  setBody(doc, fonts, 10.5)
  doc.setTextColor(...CLAW_BODY)
  for (const line of body) {
    const wrapped = doc.splitTextToSize(line, CONTENT_W) as string[]
    for (const w of wrapped) {
      if (y > A4_H - 70) {
        y = clawSectionPage(doc, fonts, agency, pageTitle)
      }
      doc.text(w, M, y)
      y += 15
    }
    y += 4
  }
  return y + 8
}

// =============================================================================
// CIM — Confidential Information Memorandum
// =============================================================================
export async function exportCimToPdf(content: CimContent, opts?: PdfOpts): Promise<Uint8Array | void> {
  const agency = opts?.agency || null
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const fonts = await registerClawFonts(doc)
  const W = doc.internal.pageSize.getWidth()

  // ---- Cover ----
  await clawCover(doc, fonts, {
    image: '/brand/claw-cover.jpg',
    eyebrow: 'Confidential Information Memorandum',
    title: content.title,
    subtitle: content.subtitle,
    agency,
    prepared: content.generatedAt,
    extra: ['CONFIDENTIAL — UNDER NDA'],
  })

  // ---- Table of contents ----
  doc.addPage()
  clawPageBg(doc)
  clawFooter(doc, agency, fonts)
  setHead(doc, fonts, 20, 1)
  doc.setTextColor(...CLAW_GOLD)
  doc.text('Table of Contents', M, 80)
  clawRule(doc, 92)
  let ty = 130
  setBody(doc, fonts, 11.5)
  doc.setTextColor(...CLAW_BODY)
  for (const s of content.sections) {
    const lines = doc.splitTextToSize(s.title, CONTENT_W) as string[]
    for (const l of lines) {
      if (ty > A4_H - 70) {
        doc.addPage()
        clawPageBg(doc)
        clawFooter(doc, agency, fonts)
        ty = 70
      }
      doc.text(l, M, ty)
      ty += 22
    }
  }

  // ---- Sections ----
  for (const section of content.sections) {
    let y = clawSectionPage(doc, fonts, agency, section.title)
    for (const sub of section.subsections) {
      y = clawBody(doc, fonts, agency, sub.heading, sub.body, y, section.title)
      if (y > A4_H - 80) y = clawSectionPage(doc, fonts, agency, section.title)
    }
  }

  // ---- Confidentiality (final page) ----
  let y = clawSectionPage(doc, fonts, agency, 'Confidentiality')
  setBody(doc, fonts, 10.5)
  doc.setTextColor(...CLAW_BODY)
  const disc = doc.splitTextToSize(
    'This document is confidential and proprietary to the seller and its advisor. It is provided solely for the purpose of evaluating a potential transaction and may not be reproduced, distributed, or used for any other purpose without the prior written consent of the seller. Recipients agree to maintain the confidentiality of the information contained herein and to use it solely to evaluate an acquisition of the subject business. This memorandum does not constitute an offer to sell. Information is provided "as is" without warranty of accuracy or completeness.',
    CONTENT_W,
  ) as string[]
  for (const l of disc) {
    if (y > A4_H - 70) y = clawSectionPage(doc, fonts, agency, 'Confidentiality')
    doc.text(l, M, y)
    y += 15
  }

  if (opts?.returnBytes) {
    return new Uint8Array(doc.output('arraybuffer'))
  }
  doc.save(`${content.title.replace(/[^a-z0-9]+/gi, '_')}_CIM.pdf`)
}

// =============================================================================
// BOV — Broker Opinion of Value
// =============================================================================
export async function exportBovToPdf(content: BovContent, opts?: PdfOpts): Promise<Uint8Array | void> {
  const agency = opts?.agency || null
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const fonts = await registerClawFonts(doc)
  const W = doc.internal.pageSize.getWidth()

  // ---- Cover ----
  await clawCover(doc, fonts, {
    image: '/brand/claw-cover.jpg',
    eyebrow: 'Broker Opinion of Value',
    title: content.businessName,
    subtitle: 'Valuation Analysis & Market Opinion',
    agency,
    prepared: content.generatedAt,
    extra: [`For: ${content.preparedFor}`, 'PRIVILEGED & CONFIDENTIAL — UNDER NON-DISCLOSURE'],
  })

  // ---- Table of contents ----
  doc.addPage()
  clawPageBg(doc)
  clawFooter(doc, agency, fonts)
  setHead(doc, fonts, 20, 1)
  doc.setTextColor(...CLAW_GOLD)
  doc.text('Table of Contents', M, 80)
  clawRule(doc, 92)
  let ty = 132
  setBody(doc, fonts, 11.5)
  doc.setTextColor(...CLAW_BODY)
  const tocItems = ['Executive Summary', ...content.sections.map((s) => s.title), 'Comparable Transactions', 'Assumptions & Methodology']
  tocItems.forEach((t, i) => {
    if (ty > A4_H - 70) {
      doc.addPage()
      clawPageBg(doc)
      clawFooter(doc, agency, fonts)
      ty = 70
    }
    doc.text(`${i + 1}.  ${t}`, M, ty)
    ty += 26
  })

  // ---- Valuation summary snapshot ----
  let y = clawSectionPage(doc, fonts, agency, 'Valuation Summary')
  clawWatermark(doc, fonts, content.valuationRange)
  const cols: ClawTableCol[] = [
    { label: 'Metric', x: M + 4, w: 200 },
    { label: 'Value', x: M + 210, w: CONTENT_W - 214, align: 'right' },
  ]
  const rows: (string | number)[][] = [
    ['Business', content.businessName],
    ['Asking Price', fmt(content.askingPrice)],
    ['Annual Revenue', fmt(content.revenue)],
    ['Normalized SDE', fmt(content.sde)],
    ['Normalized EBITDA', fmt(content.ebitda)],
    ['Price / Revenue', content.revenueMultiple],
    ['Price / SDE', content.sdeMultiple],
    ['Price / EBITDA', content.ebitdaMultiple],
    ['Indicative Value Range', content.valuationRange],
  ]
  y = clawTable(doc, fonts, cols, rows, y, { rowH: 22, moneyCols: [1], highlightRows: [1, 8] }) + 26

  // Valuation conclusion callout
  setBody(doc, fonts, 11)
  doc.setTextColor(...CLAW_BODY)
  const concl = doc.splitTextToSize(content.conclusion, CONTENT_W) as string[]
  for (const l of concl) {
    if (y > A4_H - 70) y = clawSectionPage(doc, fonts, agency, 'Valuation Summary')
    doc.text(l, M, y)
    y += 16
  }

  // ---- Full sections ----
  for (const section of content.sections) {
    y = clawSectionPage(doc, fonts, agency, section.title)
    for (const sub of section.subsections) {
      y = clawBody(doc, fonts, agency, sub.heading, sub.body, y, section.title)
      if (y > A4_H - 80) y = clawSectionPage(doc, fonts, agency, section.title)
    }
  }

  // ---- Comparable transactions ----
  y = clawSectionPage(doc, fonts, agency, 'Comparable Transactions')
  const cmpCols: ClawTableCol[] = [
    { label: 'Business', x: M + 4, w: 120 },
    { label: 'Industry', x: M + 128, w: 80 },
    { label: 'Location', x: M + 212, w: 80 },
    { label: 'Price', x: M + 296, w: 70, align: 'right' },
    { label: 'Revenue', x: M + 370, w: 70, align: 'right' },
    { label: 'Multiple', x: M + 444, w: CONTENT_W - 448, align: 'right' },
  ]
  const cmpRows = content.comparables.map((c) => [c.business, c.industry, c.location, fmt(c.price), fmt(c.revenue), c.multiple ? c.multiple.toFixed(2) + 'x' : 'N/A'])
  y = clawTable(doc, fonts, cmpCols, cmpRows, y, { rowH: 20, moneyCols: [3, 4] }) + 24

  // ---- Assumptions + disclaimer ----
  setHead(doc, fonts, 13, 0.5)
  doc.setTextColor(...CLAW_TEAL)
  doc.text('Assumptions & Methodology', M, y)
  y += 18
  setBody(doc, fonts, 10.5)
  doc.setTextColor(...CLAW_BODY)
  for (const a of content.assumptions) {
    const lines = doc.splitTextToSize('•  ' + a, CONTENT_W) as string[]
    for (const l of lines) {
      if (y > A4_H - 70) y = clawSectionPage(doc, fonts, agency, 'Assumptions & Methodology')
      doc.text(l, M, y)
      y += 15
    }
  }
  y += 10
  setBody(doc, fonts, 9.5)
  doc.setTextColor(...CLAW_MUTED)
  const dis = doc.splitTextToSize('Disclaimer: ' + content.disclaimer, CONTENT_W) as string[]
  for (const l of dis) {
    if (y > A4_H - 70) y = clawSectionPage(doc, fonts, agency, 'Assumptions & Methodology')
    doc.text(l, M, y)
    y += 14
  }

  if (opts?.returnBytes) {
    return new Uint8Array(doc.output('arraybuffer'))
  }
  doc.save(`${content.businessName.replace(/[^a-z0-9]+/gi, '_')}_BOV.pdf`)
}

// =============================================================================
// Recast — Financial Recasting Report
// =============================================================================
export async function exportRecastToPdf(result: RecastResult, opts?: PdfOpts): Promise<Uint8Array | void> {
  const agency = opts?.agency || null
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const fonts = await registerClawFonts(doc)
  const W = doc.internal.pageSize.getWidth()

  // ---- Cover ----
  await clawCover(doc, fonts, {
    image: '/brand/claw-data.jpg',
    eyebrow: 'Recasted Financial Statement',
    title: result.businessName || 'Recast Report',
    subtitle: 'Normalized SDE / EBITDA Analysis',
    agency,
    prepared: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    extra: [
      `Entity Type: ${result.entityType.toUpperCase().replace('_', '-')}`,
      `Fiscal Periods Covered: ${result.years.length}`,
      'CONFIDENTIAL',
    ],
  })

  // ---- Summary ----
  let y = clawSectionPage(doc, fonts, agency, 'Recast Summary')
  clawWatermark(doc, fonts, fmtR(result.avgSDE, result.currency))

  const cols: ClawTableCol[] = [
    { label: 'Metric', x: M + 4, w: 220 },
    { label: 'Average', x: M + 230, w: CONTENT_W - 234, align: 'right' },
  ]
  const rows: (string | number)[][] = [
    ['Average SDE — Seller\'s Discretionary Earnings', fmtR(result.avgSDE, result.currency)],
    ['Average EBITDA', fmtR(result.avgEBITDA, result.currency)],
  ]
  y = clawTable(doc, fonts, cols, rows, y, { rowH: 24, moneyCols: [1], highlightRows: [0] }) + 22

  setHead(doc, fonts, 12, 0.5)
  doc.setTextColor(...CLAW_TEAL)
  doc.text('Earnings Trend', M, y)
  y += 18
  setBody(doc, fonts, 10.5)
  doc.setTextColor(...CLAW_BODY)
  const trend = doc.splitTextToSize(result.trendNote, CONTENT_W) as string[]
  for (const l of trend) {
    if (y > A4_H - 70) y = clawSectionPage(doc, fonts, agency, 'Recast Summary')
    doc.text(l, M, y)
    y += 15
  }

  // ---- Before vs After ----
  const yearsSorted = result.years.slice().sort((a, b) => b.year - a.year)
  const yearCols: ClawTableCol[] = [
    { label: 'Metric', x: M + 4, w: 150 },
    ...yearsSorted.map((yr, i) => ({ label: yr.label, x: M + 158 + i * ((CONTENT_W - 154) / yearsSorted.length), w: (CONTENT_W - 154) / yearsSorted.length, align: 'right' as const })),
  ]
  const bvRows: { label: string; key: (yr: RecastYearResult) => string; highlight?: boolean; gold?: boolean }[] = [
    { label: 'Revenue', key: (yr) => fmtR(yr.recast.revenue, result.currency), highlight: true },
    { label: 'As-Reported Net Income', key: (yr) => fmtR(yr.asReported.netIncome, result.currency) },
    { label: '+ Total Add-backs', key: (yr) => '+' + fmtR(yr.totalAddBacks, result.currency), gold: true },
    { label: 'Recast SDE', key: (yr) => fmtR(yr.recast.sde, result.currency), highlight: true, gold: true },
    { label: 'Recast EBITDA', key: (yr) => fmtR(yr.recast.ebitda, result.currency), highlight: true },
  ]
  const dataRows = bvRows.map((r) => [r.label, ...yearsSorted.map((yr) => r.key(yr))])
  y = clawSectionPage(doc, fonts, agency, 'Before vs After — Recast Comparison')
  y = clawTable(doc, fonts, yearCols, dataRows, y, { rowH: 22, moneyCols: yearsSorted.map((_, i) => i + 1), highlightRows: [0, 3, 4] }) + 24

  // ---- Add-back detail ----
  setHead(doc, fonts, 14, 0.5)
  doc.setTextColor(...CLAW_GOLD)
  doc.text('Add-Back Detail', M, y)
  y += 14
  clawRule(doc, y)
  y += 22
  setBody(doc, fonts, 9.5)
  for (const yr of yearsSorted) {
    setHead(doc, fonts, 10.5, 0.3)
    doc.setTextColor(...CLAW_TEAL)
    doc.text(`${yr.label} — Total Add-backs: ${fmtR(yr.totalAddBacks, result.currency)}`, M, y)
    y += 15
    setBody(doc, fonts, 9.5)
    doc.setTextColor(...CLAW_BODY)
    for (const d of yr.addBackDetail) {
      if (y > A4_H - 70) y = clawSectionPage(doc, fonts, agency, 'Add-Back Detail')
      doc.text('•  ' + d.label, M + 8, y)
      doc.setTextColor(...CLAW_GOLD_DARK)
      doc.text('+' + fmt(d.amount), W - M, y, { align: 'right' })
      doc.setTextColor(...CLAW_BODY)
      y += 15
    }
    if (yr.addBackDetail.length === 0) {
      doc.setTextColor(...CLAW_MUTED)
      doc.text('No add-backs recorded for this period.', M + 8, y)
      doc.setTextColor(...CLAW_BODY)
      y += 15
    }
    y += 8
  }

  // ---- Disclaimer ----
  y += 12
  setBody(doc, fonts, 9.5)
  doc.setTextColor(...CLAW_MUTED)
  const disc = doc.splitTextToSize(
    'Disclaimer: This recast is an estimate prepared for business-valuation purposes and may not reflect GAAP financial statements. Add-backs are subject to buyer and lender verification. Figures include owner compensation, non-recurring, discretionary and non-arm\'s-length adjustments as standard industry practice for SDE/EBITDA normalization.',
    CONTENT_W,
  ) as string[]
  for (const l of disc) {
    if (y > A4_H - 70) y = clawSectionPage(doc, fonts, agency, 'Disclaimer')
    doc.text(l, M, y)
    y += 14
  }

  if (opts?.returnBytes) {
    return new Uint8Array(doc.output('arraybuffer'))
  }
  doc.save(`${result.businessName.replace(/[^a-z0-9]+/gi, '_')}_Recast_Report.pdf`)
}

// =============================================================================
// BLI — one-page Business Listing Information summary
// =============================================================================
export async function exportBliToPdf(content: BliContent, opts?: PdfOpts): Promise<Uint8Array | void> {
  const agency = opts?.agency || null
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const fonts = await registerClawFonts(doc)
  const W = doc.internal.pageSize.getWidth()

  await clawCover(doc, fonts, {
    image: '/brand/claw-data.jpg',
    eyebrow: 'Business Listing Information',
    title: content.businessName,
    subtitle: [content.industry, content.location].filter(Boolean).join(' · ') || 'Business Opportunity',
    agency,
    prepared: content.generatedAt,
    extra: ['PRIVILEGED & CONFIDENTIAL — UNDER NON-DISCLOSURE'],
  })

  let y = clawSectionPage(doc, fonts, agency, 'Offer Summary')
  const cols: ClawTableCol[] = [
    { label: 'Metric', x: M + 4, w: 250 },
    { label: 'Value', x: M + 260, w: CONTENT_W - 264, align: 'right' },
  ]
  const rows: (string | number)[][] = [
    ['Asking Price', fmt(content.askingPrice)],
    ['Annual Revenue', fmt(content.metrics.revenue)],
    ["Seller's Discretionary Earnings (SDE)", fmt(content.metrics.sde)],
    ['EBITDA', fmt(content.metrics.ebitda)],
    ['Gross Margin', content.metrics.grossMargin === null ? '—' : (content.metrics.grossMargin * 100).toFixed(0) + '%'],
    ['SDE Margin', content.metrics.sdeMargin === null ? '—' : (content.metrics.sdeMargin * 100).toFixed(0) + '%'],
    ['Price / Revenue', content.metrics.priceToRevenue === null ? '—' : content.metrics.priceToRevenue.toFixed(2) + 'x'],
    ['Price / SDE', content.metrics.priceToSde === null ? '—' : content.metrics.priceToSde.toFixed(2) + 'x'],
    ['Price / EBITDA', content.metrics.priceToEbitda === null ? '—' : content.metrics.priceToEbitda.toFixed(2) + 'x'],
  ]
  y = clawTable(doc, fonts, cols, rows, y, { rowH: 22, moneyCols: [1], highlightRows: [0] }) + 26

  setHead(doc, fonts, 13, 0.5)
  doc.setTextColor(...CLAW_TEAL)
  doc.text('Investment Highlights', M, y)
  y += 18
  const highlights = content.sections.find((s) => s.id === 'investment-highlights')
  const paras = (highlights?.subsections || []).flatMap((s) => s.body)
  setBody(doc, fonts, 10.5)
  doc.setTextColor(...CLAW_BODY)
  for (const p of paras) {
    const wrapped = doc.splitTextToSize(p, CONTENT_W) as string[]
    for (const l of wrapped) {
      if (y > A4_H - 70) y = clawSectionPage(doc, fonts, agency, 'Investment Highlights')
      doc.text(l, M, y)
      y += 15
    }
    y += 5
  }

  y += 8
  setBody(doc, fonts, 9)
  doc.setTextColor(...CLAW_MUTED)
  const disc = doc.splitTextToSize('Confidential — provided solely to qualified prospective buyers under NDA. Figures unaudited; verify during due diligence.', CONTENT_W) as string[]
  for (const l of disc) {
    if (y > A4_H - 70) y = clawSectionPage(doc, fonts, agency, 'Confidentiality')
    doc.text(l, M, y)
    y += 13
  }

  if (opts?.returnBytes) {
    return new Uint8Array(doc.output('arraybuffer'))
  }
  doc.save(`${content.businessName.replace(/[^a-z0-9]+/gi, '_')}_BLI.pdf`)
}
