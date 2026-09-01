/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Store print-ready file generator — closes the "no artwork" gap.
// -----------------------------------------------------------------------------
// When a broker pays for marketing materials, the system auto-generates a
// branded, print-ready PDF for that product (correct trim size, brand colors,
// order ref, ship-to, CTA) and uploads it to storage. The work-order email
// then carries the download link so the supplier can actually print. Zero
// design work, zero touching — the owner never opens a file.
//
// Server-safe (pdf-lib, no DOM). Page sizes are in PostScript points
// (1 inch = 72 pt), 300 DPI at print size.
// =============================================================================

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export const NAVY = rgb(0.102, 0.102, 0.18)       // #1a1a2e
export const GOLD = rgb(0.788, 0.659, 0.298)      // #c9a84c
export const INK = rgb(0.16, 0.16, 0.24)
export const MUTED = rgb(0.48, 0.5, 0.56)
export const CREAM = rgb(0.965, 0.945, 0.9)

export interface PrintFileInput {
  orderId: string
  workOrderRef: string
  productName: string
  category: string
  quantity: number
  shipTo: { name: string; line1: string; line2?: string; city: string; state: string; zip: string }
  /** Optional business/listing context to brand the piece with. */
  businessName?: string
  headline?: string
  contact?: { name?: string; phone?: string; email?: string; website?: string }
  brand?: { name?: string; primaryColor?: string }
  /** AI-generated background art (no text) — real text is overlaid on top. */
  backgroundImageUrl?: string
}

/** Print spec per product category: page size in points + friendly label. */
export function printSpecFor(category: string): { width: number; height: number; label: string; bleed: number } {
  switch (category) {
    case 'business_cards': return { width: 252, height: 144, label: 'Business Card · 3.5" × 2"', bleed: 9 }   // 3.5x2in
    case 'postcards':      return { width: 288, height: 432, label: 'Postcard · 4" × 6"', bleed: 9 }          // 4x6in
    case 'flyers':         return { width: 612, height: 792, label: 'Flyer · 8.5" × 11"', bleed: 9 }
    case 'brochures':      return { width: 612, height: 792, label: 'Brochure · 8.5" × 11" tri-fold', bleed: 9 }
    case 'envelopes':      return { width: 684, height: 297, label: '#10 Envelope · 9.5" × 4.125"', bleed: 9 }
    case 'stationery':     return { width: 612, height: 792, label: 'Letterhead · 8.5" × 11"', bleed: 9 }
    case 'banners':        return { width: 1296, height: 432, label: 'Banner · 6" × 18" (scaled proof)', bleed: 0 }
    case 'signage':        return { width: 612, height: 1224, label: 'Signage · 8.5" × 17" (scaled proof)', bleed: 0 }
    default:               return { width: 612, height: 792, label: 'Print Spec Sheet', bleed: 9 }
  }
}

/** Wrap text at maxWidth using the given font+size. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text || '').split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Generate a branded print-ready PDF for a store order.
 * Returns the raw PDF bytes (Uint8Array) ready to upload.
 */
export async function generateStorePrintPdf(input: PrintFileInput): Promise<Uint8Array> {
  const spec = printSpecFor(input.category)
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const brandName = input.brand?.name || 'CONCORD Deal Platform'
  const brandColor = input.brand?.primaryColor ? hexToRgb(input.brand.primaryColor) : NAVY

  // AI background art (optional): fetch + embed as a full-page image so the
  // printed piece carries the custom design with REAL overlaid text.
  let background: Awaited<ReturnType<typeof PDFDocument.prototype.embedJpg>> | null = null
  if (input.backgroundImageUrl) {
    try {
      const res = await fetch(input.backgroundImageUrl, { signal: AbortSignal.timeout(20000) })
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer())
        try { background = await doc.embedJpg(bytes) } catch { try { background = await doc.embedPng(bytes) } catch { background = null } }
      }
    } catch { background = null }
  }

  const page = doc.addPage([spec.width, spec.height])
  if (background) {
    page.drawImage(background, { x: 0, y: 0, width: spec.width, height: spec.height })
  }
  drawBrandedPiece(page, { regular, bold, spec, input, brandName, brandColor })

  // Business cards get a front + back; everything else is single-sided.
  if (input.category === 'business_cards') {
    const back = doc.addPage([spec.width, spec.height])
    if (background) {
      back.drawImage(background, { x: 0, y: 0, width: spec.width, height: spec.height })
    }
    drawBackSide(back, { regular, bold, spec, input, brandName })
  }

  return doc.save()
}

interface DrawCtx {
  regular: PDFFont
  bold: PDFFont
  spec: { width: number; height: number; label: string; bleed: number }
  input: PrintFileInput
  brandName: string
  brandColor: ReturnType<typeof rgb>
}

function drawBrandedPiece(page: PDFPage, ctx: DrawCtx): void {
  const { regular, bold, spec, input, brandName, brandColor } = ctx
  const W = spec.width
  const H = spec.height
  const business = input.businessName || 'This Business Is For Sale'
  const headline = input.headline || 'Confidential Business Opportunity'
  const contact = input.contact
  const contactLines = [
    contact?.name ? `Agent: ${contact.name}` : '',
    contact?.phone ? `Phone: ${contact.phone}` : '',
    contact?.email ? `Email: ${contact.email}` : '',
    contact?.website ? `Web: ${contact.website}` : '',
  ].filter(Boolean)
  const cta = contactLines.length ? 'Contact us today for a confidential overview.' : 'Call or email today for full details.'

  // Header band.
  const bandH = Math.max(72, H * 0.16)
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: brandColor })
  page.drawText(brandName, { x: 24, y: H - bandH + (bandH - 16) / 2 + 6, size: 12, font: bold, color: rgb(1, 1, 1) })
  page.drawText('PRINT-READY', { x: W - 24 - 62, y: H - bandH + (bandH - 10) / 2 + 6, size: 8, font: bold, color: rgb(1, 1, 1) })

  // Gold rule.
  page.drawRectangle({ x: 24, y: H - bandH - 8, width: 64, height: 4, color: GOLD })

  // Headline + business name.
  page.drawText(headline.slice(0, 60), { x: 24, y: H - bandH - 40, size: 16, font: bold, color: INK })
  page.drawText(business.slice(0, 60), { x: 24, y: H - bandH - 64, size: 13, font: regular, color: MUTED })

  // Body lines (stacked, wrapping).
  let y = H - bandH - 92
  const body =
    input.category === 'brochures'
      ? 'Full-color tri-fold brochure. This side shows the cover treatment; the interior panels carry the complete listing story, financial highlights, and your advisor contact details.'
      : input.category === 'business_cards'
        ? 'Premium 14pt matte, double-sided, full color. Front shows the brand mark and headline; back carries the contact block and CTA.'
        : `Branded ${spec.label.split(' · ')[0] || 'piece'} for ${business}. High-resolution artwork, full color, crop marks included.`
  for (const line of wrap(body, regular, 10.5, W - 48).slice(0, 8)) {
    page.drawText(line, { x: 24, y, size: 10.5, font: regular, color: INK })
    y -= 15
  }

  // Contact block.
  if (contactLines.length) {
    y -= 10
    page.drawRectangle({ x: 24, y: y - 8, width: W - 48, height: contactLines.length * 15 + 18, color: CREAM })
    page.drawText('CONTACT', { x: 36, y: y + 4, size: 8, font: bold, color: GOLD })
    let cy = y - 12
    for (const line of contactLines) {
      page.drawText(line.slice(0, 60), { x: 36, y: cy, size: 10, font: regular, color: INK })
      cy -= 15
    }
    y = cy - 14
  }

  // CTA.
  page.drawText(cta, { x: 24, y: y, size: 10.5, font: bold, color: NAVY })
  y -= 26

  // Spec footer (order ref, qty, ship-to, size).
  page.drawRectangle({ x: 0, y: 0, width: W, height: 46, color: NAVY })
  page.drawText(`${input.workOrderRef} · ${input.quantity} pcs · ${spec.label}`, { x: 24, y: 24, size: 8, font: bold, color: rgb(1, 1, 1) })
  page.drawText(`Ship to: ${input.shipTo.name} — ${input.shipTo.line1}, ${input.shipTo.city} ${input.shipTo.state} ${input.shipTo.zip}`, { x: 24, y: 12, size: 7, font: regular, color: rgb(0.85, 0.85, 0.9) })
}

function drawBackSide(page: PDFPage, ctx: Omit<DrawCtx, 'brandColor'>): void {
  const { regular, bold, spec, input, brandName } = ctx
  const W = spec.width
  const H = spec.height
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) })
  page.drawText(brandName, { x: 24, y: H - 40, size: 11, font: bold, color: NAVY })
  page.drawRectangle({ x: 24, y: H - 52, width: 48, height: 3, color: GOLD })

  const contact = input.contact
  const lines = [
    input.businessName || 'Business Brokerage',
    '',
    contact?.name ? `Agent: ${contact.name}` : '',
    contact?.phone ? `Phone: ${contact.phone}` : '',
    contact?.email ? `Email: ${contact.email}` : '',
    contact?.website ? `Web: ${contact.website}` : '',
    '',
    'Confidential. Not an offer to sell.',
  ].filter((l, i) => l !== '' || i === 1)

  let y = H - 90
  for (const line of lines) {
    page.drawText(line.slice(0, 40), { x: 24, y, size: 9, font: line.startsWith('Agent') || line.startsWith('Phone') || line.startsWith('Email') || line.startsWith('Web') ? bold : regular, color: INK })
    y -= 14
  }
}

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim())
  if (!m) return NAVY
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255)
}

// -----------------------------------------------------------------------------
// Upload helper — generate + upload the print-ready PDF for a paid store order.
// Uses the dedicated PUBLIC bucket (store_print_files) so suppliers can
// download the artwork without auth. Returns the public URL or null on failure.
// -----------------------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const PRINT_BUCKET = 'store_print_files'

/** Generate + upload the print-ready PDF. Returns { url } or { error }. */
export async function createAndUploadPrintFile(input: PrintFileInput): Promise<{ url?: string; error?: string }> {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return { error: 'storage not configured' }
    const { createClient } = await import('@supabase/supabase-js')
    const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    const pdf = await generateStorePrintPdf(input)
    const path = `store-print-files/${input.orderId}.pdf`
    const { error: upErr } = await svc.storage.from(PRINT_BUCKET).upload(path, new Uint8Array(pdf), {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/pdf',
    })
    if (upErr) return { error: upErr.message }

    const { data: urlData } = svc.storage.from(PRINT_BUCKET).getPublicUrl(path)
    return { url: urlData?.publicUrl || null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'print file generation failed' }
  }
}
