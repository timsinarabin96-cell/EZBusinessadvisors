/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { jsPDF } from 'jspdf'

// =============================================================================
// Advertiser pitch PDF — the "Advertise with Concord" one-pager sales sheet.
// Navy/gold investment-bank aesthetic (matches analytics/CIM/BOV exports).
// Audience stats + rate card sourced live so the sheet always sells current
// numbers. Used by /api/admin/ads/pitch (platform admin download) and the
// "Download pitch PDF" button on /admin/ads.
// =============================================================================

const NAVY: [number, number, number] = [26, 26, 46]
const GOLD: [number, number, number] = [201, 168, 76]
const CREAM: [number, number, number] = [247, 246, 242]
const INK: [number, number, number] = [43, 43, 58]
const MUTED: [number, number, number] = [122, 122, 138]
const M = 46 // margin

export const PITCH_RATE_CARD: Array<[string, string, string]> = [
  ['Homepage Spotlight', 'Below hero, full-width banner', '$400/mo'],
  ['Marketplace Top', 'Top of the listings page', '$300/mo'],
  ['Valuation + P&L Builder', 'On both lead-magnet tools', '$250/mo'],
  ['Insights + Articles', 'Content hub sidebar', '$200/mo'],
  ['Sell Page Promo', 'Sell-your-business page', '$200/mo'],
  ['Marketplace Bottom', 'Bottom of listings page', '$150/mo'],
  ['Brokers Directory', 'Brokers page spotlight', '$150/mo'],
  ['Newsletter Slot', 'One send, your message', '$150/send'],
]

export function buildAdvertiserPitchPdf(input: { stats: { totalListings: number; avgAsking: number; totalBusinessesSold: number; industries: number }; contactEmail?: string; contactPhone?: string }): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  // ---- Cover header ----
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 120, 'F')
  doc.setFillColor(...GOLD)
  doc.rect(0, 120, W, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('times', 'bold')
  doc.setFontSize(15)
  doc.text('CONCORD  DEAL  PLATFORM', M, 52)
  doc.setFontSize(26)
  doc.text('Advertise with Concord', M, 92)
  doc.setFont('times', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(...GOLD)
  doc.text('Reach buyers, sellers, and deal professionals — on the platform where transactions happen.', M, 110)

  // ---- Audience stats ----
  let y = 152
  doc.setFont('times', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...NAVY)
  doc.text('Who you reach', M, y)
  doc.setFillColor(...GOLD)
  doc.rect(M, y + 4, 34, 2, 'F')
  y += 30

  const stats: Array<[string, string]> = [
    ['Businesses for sale', String(input.stats.totalListings)],
    ['Average asking price', input.stats.avgAsking ? `$${Math.round(input.stats.avgAsking).toLocaleString()}` : '—'],
    ['Businesses sold', String(input.stats.totalBusinessesSold)],
    ['Industries covered', String(input.stats.industries)],
  ]
  stats.forEach(([label, val], i) => {
    const colX = M + (i % 2) * ((W - 2 * M) / 2)
    const rowY = y + Math.floor(i / 2) * 34
    doc.setFont('times', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    doc.text(label.toUpperCase(), colX, rowY)
    doc.setFont('times', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...NAVY)
    doc.text(val, colX, rowY + 18)
  })
  y += 84

  // ---- Why Concord ----
  doc.setFont('times', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...NAVY)
  doc.text('Why Concord', M, y)
  doc.setFillColor(...GOLD)
  doc.rect(M, y + 4, 34, 2, 'F')
  y += 26
  const bullets = [
    'Qualified audience — active buyers, sellers, and brokers, not passive browsers.',
    'Financial rigor — every listing is recast and broker-valued; our audience trusts the data.',
    'Confidential by default — sellers and buyers engage with serious intent.',
    'Every placement is FTC-labeled "Sponsored" and clearly separated from editorial content.',
  ]
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  bullets.forEach((b) => {
    doc.setTextColor(...INK)
    doc.text('•', M, y)
    doc.text(b, M + 16, y, { maxWidth: W - 2 * M - 16 })
    y += doc.splitTextToSize(b, W - 2 * M - 16).length * 15 + 6
  })
  y += 14

  // ---- Rate card ----
  doc.setFont('times', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...NAVY)
  doc.text('Placement rate card', M, y)
  doc.setFillColor(...GOLD)
  doc.rect(M, y + 4, 34, 2, 'F')
  y += 26

  // Table header
  doc.setFillColor(...CREAM)
  doc.rect(M, y - 12, W - 2 * M, 20, 'F')
  doc.setFont('times', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...NAVY)
  doc.text('PLACEMENT', M + 8, y - 1)
  doc.text('WHERE IT RUNS', M + 200, y - 1)
  doc.text('RATE', W - M - 60, y - 1)
  y += 14

  PITCH_RATE_CARD.forEach(([name, where, rate]) => {
    doc.setFont('times', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(name, M + 8, y + 8)
    doc.text(where, M + 200, y + 8, { maxWidth: 180 })
    doc.setFont('times', 'bold')
    doc.setTextColor(...NAVY)
    doc.text(rate, W - M - 60, y + 8)
    y += 26
  })
  y += 10

  // ---- Contact / CTA ----
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...NAVY)
  doc.text('Reserve your placement', M, y)
  y += 20
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(`Email: ${input.contactEmail || 'advertising@concord.ezbusinessadvisors.com'}`, M, y)
  y += 18
  if (input.contactPhone) {
    doc.text(`Phone: ${input.contactPhone}`, M, y)
    y += 18
  }
  doc.text('Bundles available — the "Lender Package" (homepage + listings + newsletter) is $750/mo.', M, y)
  y += 22
  doc.setFontSize(9.5)
  doc.setTextColor(...MUTED)
  doc.text('Rates are monthly and subject to availability. All placements are labeled "Sponsored" per FTC guidance.', M, y)

  // ---- Footer ----
  doc.setFont('times', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text('Concord Deal Platform — EZ Business Advisors LLC', M, H - 30)

  return new Uint8Array(doc.output('arraybuffer'))
}
