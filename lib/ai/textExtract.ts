/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/ai/textExtract.ts — server-side raw text extraction from documents.
// -----------------------------------------------------------------------------
// SERVER-ONLY. Extracts readable text from stored documents so Claude can read
// them: PDFs (pdf-parse), plain text/CSV (direct), and a graceful fallback for
// unsupported binaries (Office/images) where we can't OCR server-side yet.
// =============================================================================

import type { ExtractedTextResult } from '@/lib/ai/types'
import { isPlainTextType, truncateForClaude } from '@/lib/ai/documentAnalyzer'

// Re-export the type predicate + truncator so the route stays thin.
export { isPlainTextType, truncateForClaude }

// Lazy, memoized pdf-parse (keeps module load cost off cold start hot path).
// pdf-parse v2 exposes a PDFParse CLASS — the old v1 `fn(data)` call silently
// returned nothing, which is why every PDF failed to read in production.
let pdfParse: ((data: Buffer) => Promise<{ text: string }>) | null = null
async function getPdfParser() {
  if (!pdfParse) {
    const mod: any = await import('pdf-parse')
    const v2 = mod?.PDFParse
    pdfParse = async (data: Buffer) => {
      try {
        // v2: new PDFParse({ data }).getText()
        const parser = new v2({ data })
        const r = await parser.getText()
        return { text: r?.text || '' }
      } catch {
        // v1 fallback: fn(data)
        const fn = mod?.default || mod
        if (typeof fn === 'function') return await fn(data)
        return { text: '' }
      }
    }
  }
  return pdfParse
}

// Lazy OCR: Tesseract.js (free, open-source, self-hosted). Used as the
// fallback for scanned PDFs and images so bank statements, POS summaries, and
// paper financials become machine-readable with ZERO per-page API cost.
let ocrWorker: any = null
async function getOcrWorker() {
  if (!ocrWorker) {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng')
    ocrWorker = worker
  }
  return ocrWorker
}

// ── Excel/CSV workbooks → tabular text ─────────────────────────────────────
// Reads every sheet via SheetJS (xlsx) and flattens cells into pipe-delimited
// rows so POS reports, bank statements, and P&L workbooks become readable by
// the AI analyzer. Zero API cost, server-side.
let xlsxLib: any = null
async function excelToText(data: Buffer): Promise<string> {
  try {
    if (!xlsxLib) xlsxLib = await import('xlsx')
    const wb = xlsxLib.read(data, { type: 'buffer', cellDates: true })
    const parts: string[] = []
    for (const name of wb.SheetNames.slice(0, 12)) {
      const sheet = wb.Sheets[name]
      const rows = xlsxLib.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][]
      const lines = rows
        .map((r) => (r as unknown[]).map((c) => String(c ?? '').trim()).filter(Boolean).join(' | '))
        .filter((l) => l)
      if (lines.length) {
        parts.push(`[Sheet: ${name}]`)
        parts.push(...lines.slice(0, 400))
      }
    }
    return parts.join('\n')
  } catch {
    return ''
  }
}

// ── Word .docx → text (zip of XML) ────────────────────────────────────────
// .docx is a zip containing word/document.xml — extract the <w:t> runs and
// join by paragraph so Word financial summaries become AI-readable.
let jszipLib: any = null
async function docxToText(data: Buffer): Promise<string> {
  try {
    if (!jszipLib) jszipLib = await import('jszip')
    const zip = await jszipLib.loadAsync(data)
    const docXml = zip.file('word/document.xml')
    if (!docXml) return ''
    const xml = await docXml.async('string')
    // Paragraph boundaries + inline text runs.
    const paras = xml.split(/<w:p[ >]/)
    const lines = paras
      .map((p) => {
        const runs = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []
        return runs.map((r) => r.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")).join('')
      })
      .map((l) => l.trim())
      .filter((l) => l)
    return lines.slice(0, 600).join('\n')
  } catch {
    return ''
  }
}

const IMAGE_MIME_RE = /^image\/(png|jpe?g|webp|bmp|gif|tiff?)$/i
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i

/**
 * OCR an image buffer (PNG/JPEG/WebP/BMP) into text. Pure server-side, free.
 * Returns '' on failure (callers fall back to filename heuristics).
 */
export async function ocrImageBuffer(data: Buffer): Promise<string> {
  try {
    const worker = await getOcrWorker()
    const { data: out } = await worker.recognize(data)
    return String(out?.text || '').trim()
  } catch {
    return ''
  }
}

/**
 * OCR a scanned PDF: rasterize each page via pdfjs and run Tesseract.
 * Heavier path — used only when a PDF yields no text layer.
 */
async function ocrScannedPdf(data: Buffer): Promise<string> {
  try {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
    const parts: string[] = []
    const pages = Math.min(doc.numPages, 10) // bound: first 10 pages
    for (let p = 1; p <= pages; p++) {
      try {
        const page = await doc.getPage(p)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = new OffscreenCanvas(viewport.width, viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvasContext: ctx as any, viewport }).promise
        const blob = await canvas.convertToBlob({ type: 'image/png' })
        const buf = Buffer.from(await blob.arrayBuffer())
        const text = await ocrImageBuffer(buf)
        if (text) parts.push(text)
      } catch {
        // skip page on failure
      }
    }
    return parts.join('\n').trim()
  } catch {
    return ''
  }
}

/**
 * Extract up-to-bounded plain text from a document buffer based on its MIME +
 * file extension. Returns truncated text + metadata.
 */
export async function extractDocumentText({
  fileName,
  mime,
  data,
}: {
  fileName: string
  mime: string | null
  data: Buffer
}): Promise<ExtractedTextResult> {
  const n = fileName.toLowerCase()
  const m = mime || ''

  let raw = ''

  if (isPlainTextType(mime, fileName)) {
    raw = data.toString('utf8')
  } else {
    const isPdf = m === 'application/pdf' || n.endsWith('.pdf')
    if (isPdf) {
      try {
        const parser = await getPdfParser()
        const r = await parser(data)
        raw = r.text || ''
      } catch (e) {
        raw = ''
      }
      // Scanned PDF (no text layer) → free server-side OCR.
      if (!raw.trim()) {
        raw = await ocrScannedPdf(data)
      }
    } else if (n.endsWith('.xlsx') || n.endsWith('.xls') || m.includes('spreadsheet') || m.includes('excel')) {
      // Excel / CSV workbooks → read every sheet as text rows.
      raw = await excelToText(data)
    } else if (n.endsWith('.docx') || n.endsWith('.docm')) {
      // Word .docx is a zip of XML — unpack document.xml and strip tags.
      raw = await docxToText(data)
    } else if (IMAGE_MIME_RE.test(m) || IMAGE_EXT_RE.test(n)) {
      // Scanned bank statements / POS summaries / paper financials → OCR.
      raw = await ocrImageBuffer(data)
    }
    // Word/Excel without extractable text: filename heuristics handle it.
  }

  const { text, truncated } = truncateForClaude(raw || '')

  return {
    fileName,
    mimeType: mime,
    text,
    truncated,
    byteLength: data.byteLength,
  }
}


