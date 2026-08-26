import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// =============================================================================
// Financial Intelligence Core (Phase 1) — multi-year reader regression tests.
// Locks in: adaptive years, preview+delete intake, OCR fallback, and the
// per-document extraction persistence contract.
// =============================================================================

const textExtract = readFileSync('lib/ai/textExtract.ts', 'utf8')
const intelRoute = readFileSync('app/api/financial/intelligence/route.ts', 'utf8')
const multiYear = readFileSync('components/financial/MultiYearFinancialUpload.tsx', 'utf8')
const sql = readFileSync('sql/financial_intelligence_2026_08_26.sql', 'utf8')
const filesLib = readFileSync('lib/financialFiles.ts', 'utf8')

test('fic: free OCR fallback (tesseract) is wired into extraction', () => {
  assert.match(textExtract, /tesseract\.js/)
  assert.match(textExtract, /ocrImageBuffer/)
  assert.match(textExtract, /ocrScannedPdf/)
  assert.match(textExtract, /IMAGE_MIME_RE/)
})

test('fic: scanned PDFs + images are OCR\'d server-side (free, no API cost)', () => {
  assert.match(textExtract, /Scanned PDF \(no text layer\) → free server-side OCR/)
  assert.match(textExtract, /Scanned bank statements \/ POS summaries \/ paper financials → OCR/)
})

test('fic: intelligence route persists per-document extractions w/ confidence', () => {
  assert.match(intelRoute, /financial_extractions/)
  assert.match(intelRoute, /confidence/)
  assert.match(intelRoute, /review_state: 'pending'/)
  assert.match(intelRoute, /fiscalYear/)
  assert.match(intelRoute, /doc_type/)
})

test('fic: multi-year upload has preview + delete for every queued file', () => {
  assert.match(multiYear, /QueuedPreview/)
  assert.match(multiYear, /URL\.createObjectURL/)
  assert.match(multiYear, /Remove/)
  assert.match(multiYear, /Delete/)
  assert.match(multiYear, /Preview/)
})

test('fic: adaptive operating history (1-5 years, no forced year-3 gate)', () => {
  assert.match(multiYear, /Years of history/)
  assert.match(multiYear, /1, 2, 3, 4, 5/)
  assert.match(multiYear, /limited operating history/)
  assert.match(multiYear, /established track record/)
  assert.match(multiYear, /fiscalYear/)
  assert.match(multiYear, /operatingYears/)
})

test('fic: SQL adds fiscal_year/operating_years + financial_extractions + RLS', () => {
  assert.match(sql, /fiscal_year int/)
  assert.match(sql, /operating_years int/)
  assert.match(sql, /create table if not exists public\.financial_extractions/)
  assert.match(sql, /financial_history_band/)
  assert.match(sql, /enable row level security/)
})

test('fic: upload carries the year stamp onto every document', () => {
  assert.match(filesLib, /fiscal_year: meta\.fiscalYear/)
  assert.match(filesLib, /operating_years: meta\.operatingYears/)
})
