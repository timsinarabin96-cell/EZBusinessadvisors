/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Open Claw document theme — shared engine for CIM / BOV / Recast PDFs.
// Palette: #0B0C10 near-black · #C9A84C gold · #45A29E teal · #F5F5F5 body.
// Type: Playfair Display (headlines) · Inter (body/data).
// -----------------------------------------------------------------------------
// BROWSER-ONLY asset loading (fetch from /public). Server-side callers
// (autoGenerate pipeline) must pass preloaded base64 assets via `assets`.
// =============================================================================

import { jsPDF } from 'jspdf'

// ---- Palette (RGB) ----------------------------------------------------------
export const CLAW_BG: [number, number, number] = [11, 12, 16] // #0B0C10
export const CLAW_GOLD: [number, number, number] = [201, 168, 76] // #C9A84C
export const CLAW_GOLD_DARK: [number, number, number] = [168, 135, 47]
export const CLAW_TEAL: [number, number, number] = [69, 162, 158] // #45A29E
export const CLAW_BODY: [number, number, number] = [245, 245, 245] // #F5F5F5
export const CLAW_MUTED: [number, number, number] = [122, 130, 136] // #7A8288
export const CLAW_ROW_A: [number, number, number] = [31, 40, 51] // #1F2833
export const CLAW_ROW_B: [number, number, number] = [22, 27, 34] // #161B22

export const FONT_HEAD = 'PlayfairDisplay'
export const FONT_BODY = 'Inter'

export interface DocAgency {
  name: string
  phone?: string | null
  email?: string | null
  /** Display/legal name override (licensing: broker's own brand, never EZ). */
  displayName?: string | null
}

/** Preloaded base64 assets (server pipeline). Keys are the public paths. */
export interface ClawAssets {
  fonts?: Record<string, string>
  images?: Record<string, string>
}

const A4_W = 595.28
const A4_H = 841.89
const M = 56 // page margin (pt)

// ---- Asset loading (browser only) --------------------------------------------
async function loadBase64(publicPath: string): Promise<string | null> {
  if (typeof window === 'undefined') return null
  try {
    const res = await fetch(publicPath)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let bin = ''
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
    }
    return btoa(bin)
  } catch {
    return null
  }
}

/** Resolve an asset: prefer preloaded (server), else fetch (browser). */
async function assetB64(assets: ClawAssets | undefined, kind: 'fonts' | 'images', key: string): Promise<string | null> {
  const pre = assets?.[kind]?.[key]
  if (pre) return pre
  if (typeof window !== 'undefined') return loadBase64(key)
  return null
}

// ---- Font registration -------------------------------------------------------
export interface ClawFonts {
  headOk: boolean
  bodyOk: boolean
}

const FONT_FILES = [
  { file: '/fonts/PlayfairDisplay_700Bold.ttf', family: FONT_HEAD, style: 'bold' },
  { file: '/fonts/PlayfairDisplay_400Regular.ttf', family: FONT_HEAD, style: 'normal' },
  { file: '/fonts/Inter_400Regular.ttf', family: FONT_BODY, style: 'normal' },
  { file: '/fonts/Inter_700Bold.ttf', family: FONT_BODY, style: 'bold' },
]

export async function registerClawFonts(doc: jsPDF, assets?: ClawAssets): Promise<ClawFonts> {
  const ok: ClawFonts = { headOk: false, bodyOk: false }
  for (const f of FONT_FILES) {
    try {
      const b64 = await assetB64(assets, 'fonts', f.file)
      if (!b64) continue
      doc.addFileToVFS(f.file, b64)
      doc.addFont(f.file, f.family, f.style)
      if (f.family === FONT_HEAD) ok.headOk = true
      if (f.family === FONT_BODY) ok.bodyOk = true
    } catch {
      /* fall back to built-ins */
    }
  }
  return ok
}

// ---- Type helpers -------------------------------------------------------------
export function setHead(doc: jsPDF, fonts: ClawFonts, size: number, tracking = 0): void {
  doc.setFont(fonts.headOk ? FONT_HEAD : 'times', 'bold')
  doc.setFontSize(size)
  try {
    doc.setCharSpace(tracking)
  } catch {
    /* older jspdf */
  }
}

export function setBody(doc: jsPDF, fonts: ClawFonts, size: number, bold = false): void {
  doc.setFont(fonts.bodyOk ? FONT_BODY : 'helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  try {
    doc.setCharSpace(0)
  } catch {
    /* noop */
  }
}

// ---- Footer: gold rule + agency line ------------------------------------------
export function clawFooter(doc: jsPDF, agency: DocAgency | null | undefined, fonts?: ClawFonts): void {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...CLAW_GOLD)
  doc.setLineWidth(2)
  doc.line(M, H - 44, W - M, H - 44)
  // LICENSING: use the agency's OWN name. Never append "Business Advisors" —
  // that was EZ's brand baked into the footer; a licensed broker's PDF must
  // read "Harbor Acquisitions", not "Harbor Acquisitions | Business Advisors".
  const name = agency?.displayName?.trim() || agency?.name?.trim() || 'Concord Deal Platform'
  const phone = agency?.phone?.trim() || ''
  const email = agency?.email?.trim() || ''
  const parts = [name]
  if (phone) parts.push(phone)
  if (email) parts.push(email)
  parts.push('Strictly Confidential')
  doc.setTextColor(...CLAW_MUTED)
  setBody(doc, fonts || { headOk: false, bodyOk: false }, 8)
  doc.text(parts.join(' | '), W / 2, H - 26, { align: 'center' })
}

// ---- Dark page background -----------------------------------------------------
export function clawPageBg(doc: jsPDF): void {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.setFillColor(...CLAW_BG)
  doc.rect(0, 0, W, H, 'F')
}

// ---- Pull-quote watermark (72pt gold @ 15% opacity) ----------------------------
export function clawWatermark(doc: jsPDF, fonts: ClawFonts, text: string, opts?: { y?: number; size?: number; opacity?: number }): void {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  doc.saveGraphicsState()
  try {
    doc.setGState(new (doc as any).GState({ opacity: opts?.opacity ?? 0.15 }))
    setHead(doc, fonts, opts?.size ?? 72, 2)
    doc.setTextColor(...CLAW_GOLD)
    doc.text(text, W / 2, opts?.y ?? H / 2, { align: 'center' })
  } catch {
    /* watermark is decorative */
  }
  doc.restoreGraphicsState()
}

// ---- Gold rule under a title ----------------------------------------------------
export function clawRule(doc: jsPDF, y: number, width = 70): void {
  doc.setDrawColor(...CLAW_GOLD)
  doc.setLineWidth(2)
  doc.line(M, y, M + width, y)
}

// ---- Table: gold header, alternating rows, teal borders -------------------------
export interface ClawTableCol {
  label: string
  x: number
  w: number
  align?: 'left' | 'center' | 'right'
}

export function clawTable(
  doc: jsPDF,
  fonts: ClawFonts,
  cols: ClawTableCol[],
  rows: (string | number)[][],
  y: number,
  opts: { rowH?: number; moneyCols?: number[]; highlightRows?: number[] } = {},
): number {
  const W = doc.internal.pageSize.getWidth()
  const rowH = opts.rowH || 20
  const headerH = 22
  const moneyCols = opts.moneyCols || []
  const highlight = opts.highlightRows || []

  doc.setFillColor(...CLAW_GOLD)
  doc.rect(M, y, W - M * 2, headerH, 'F')
  doc.setTextColor(...CLAW_BG)
  setBody(doc, fonts, 8.5, true)
  for (const c of cols) {
    doc.text(c.label, c.x, y + headerH / 2 + 3, { align: c.align || 'left' })
  }
  y += headerH

  rows.forEach((r, ri) => {
    const fill = highlight.includes(ri) ? ([40, 34, 18] as [number, number, number]) : ri % 2 === 0 ? CLAW_ROW_A : CLAW_ROW_B
    doc.setFillColor(...fill)
    doc.rect(M, y, W - M * 2, rowH, 'F')
    doc.setDrawColor(...CLAW_TEAL)
    doc.setLineWidth(0.5)
    doc.rect(M, y, W - M * 2, rowH, 'S')
    doc.setTextColor(...(highlight.includes(ri) ? CLAW_GOLD : CLAW_BODY))
    setBody(doc, fonts, 8.5, highlight.includes(ri))
    cols.forEach((c, ci) => {
      const val = r[ci]
      const text = val === null || val === undefined ? '—' : String(val)
      doc.text(text, c.x, y + rowH / 2 + 3, { align: moneyCols.includes(ci) ? 'right' : c.align || 'left' })
    })
    y += rowH
  })
  doc.setDrawColor(...CLAW_TEAL)
  doc.setLineWidth(0.5)
  doc.line(M, y, W - M, y)
  return y
}

// ---- Cover page: claw image + gradient overlay + gold rule ---------------------
export async function clawCover(
  doc: jsPDF,
  fonts: ClawFonts,
  opts: {
    image?: string
    eyebrow: string
    title: string
    subtitle: string
    agency?: DocAgency | null
    prepared: string
    extra?: string[]
    assets?: ClawAssets
  },
): Promise<void> {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  clawPageBg(doc)

  if (opts.image) {
    const b64 = await assetB64(opts.assets, 'images', opts.image)
    if (b64) {
      try {
        const props = (doc as any).getImageProperties ? (doc as any).getImageProperties(b64) : null
        if (props && props.width) {
          const imgH = (W / props.width) * props.height
          const yOff = (H - imgH) / 2
          doc.addImage(b64, 'JPEG', 0, yOff, W, imgH)
        } else {
          doc.addImage(b64, 'JPEG', 0, 0, W, H)
        }
      } catch {
        /* image is decorative */
      }
    }
  }

  // Gradient overlay — full-page protection so headline text is always
  // legible over the artwork: ~30% black at the top rising to ~85% at the
  // bottom (12 bands). The title block sits in the 0.42H band, which now
  // carries a solid floor of contrast instead of a near-zero scrim.
  const bands = 12
  const startY = 0
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1)
    const opacity = 0.35 + 0.5 * t * t
    const bandH = H / bands
    doc.saveGraphicsState()
    try {
      doc.setGState(new (doc as any).GState({ opacity }))
      doc.setFillColor(0, 0, 0)
      doc.rect(0, startY + i * bandH, W, bandH + 1, 'F')
    } catch {
      /* noop */
    }
    doc.restoreGraphicsState()
  }

  // Solid text-protection panel behind the title block (guarantees legibility
  // regardless of the artwork brightness at 0.42H–0.62H).
  const panelTop = H * 0.40
  const panelBottom = Math.min(H * 0.66, H - 120)
  doc.saveGraphicsState()
  try {
    doc.setGState(new (doc as any).GState({ opacity: 0.62 }))
    doc.setFillColor(8, 10, 12)
    doc.roundedRect(0, panelTop, W, panelBottom - panelTop, 0, 0, 'F')
  } catch {
    /* noop */
  }
  doc.restoreGraphicsState()

  doc.setDrawColor(...CLAW_GOLD)
  doc.setLineWidth(2.5)
  doc.line(0, H * 0.42, W, H * 0.42)

  setHead(doc, fonts, 11, 4)
  doc.setTextColor(...CLAW_GOLD)
  doc.text(opts.eyebrow.toUpperCase(), M, H * 0.42 + 40)

  setHead(doc, fonts, 30, 2)
  doc.setTextColor(...CLAW_BODY)
  const titleLines = doc.splitTextToSize(opts.title, W - M * 2) as string[]
  let ty = H * 0.42 + 72
  for (const l of titleLines) {
    doc.text(l, M, ty)
    ty += 34
  }

  setBody(doc, fonts, 14)
  doc.setTextColor(...CLAW_GOLD)
  const subLines = doc.splitTextToSize(opts.subtitle, W - M * 2) as string[]
  ty += 8
  for (const l of subLines) {
    doc.text(l, M, ty)
    ty += 18
  }

  ty += 10
  setBody(doc, fonts, 10)
  doc.setTextColor(...CLAW_MUTED)
  for (const line of opts.extra || []) {
    doc.text(line, M, ty)
    ty += 15
  }

  setBody(doc, fonts, 10)
  doc.setTextColor(...CLAW_MUTED)
  doc.text(`Prepared: ${opts.prepared}`, M, H - 78)
  if (opts.agency?.name) {
    doc.setTextColor(...CLAW_GOLD)
    doc.text(opts.agency.name, M, H - 62)
  }

  clawFooter(doc, opts.agency, fonts)
}
