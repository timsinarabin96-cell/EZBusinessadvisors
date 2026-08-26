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
let pdfParse: ((data: Buffer) => Promise<{ text: string }>) | null = null
async function getPdfParser() {
  if (!pdfParse) {
    const mod: any = await import('pdf-parse')
    const fn = mod?.default || mod
    pdfParse = (data: Buffer) => fn(data)
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

/**
 * Best-effort structured CSV parse into a lightweight normalized row set so a
 * text/CSV financial file can feed the extractor even before Claude.
 */
export function csvToRows(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = lines[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase())
  const rows: Record<string, string>[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cells = line.split(/[,;\t]/)
    const rec: Record<string, string> = {}
    header.forEach((h, i) => { rec[h] = (cells[i] || '').trim() })
    rows.push(rec)
  }
  return rows
}
