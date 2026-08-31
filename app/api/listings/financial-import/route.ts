/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { FF_BUCKET, autoTagCategory, fileKindOf } from '@/lib/storageBuckets'
import { extractDocumentText } from '@/lib/ai/textExtract'
import { analyzeDocumentText, detectUniversalDocType } from '@/lib/ai/documentAnalyzer'
import { isClaudeConfigured } from '@/lib/claude/client'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_SIZE = 12 * 1024 * 1024 // 12 MB

// =============================================================================
// POST /api/listings/financial-import — upload one financial document
// (P&L, tax return, bank statement, CSV, etc.) from the Listing Studio and
// return the extracted financials (revenue, SDE, EBITDA, years, tags) so the
// form can pre-fill itself. If listingId is provided, the doc is stored in
// the listing's financial_documents for the downstream pipeline.
//
// Multipart body: file (required), listingId (optional uuid)
// =============================================================================

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Server client not configured.' }, { status: 500 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data.' }, { status: 400 })
  }

  const file = form.get('file')
  const listingIdRaw = form.get('listingId')
  const listingId = typeof listingIdRaw === 'string' && listingIdRaw ? listingIdRaw : null
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'file is required.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: 'File is over 12 MB.' }, { status: 413 })
  }

  // Agency gate when a listing is supplied (IDOR guard).
  if (listingId) {
    try {
      const { data: listing } = await supabase.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
      const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
      if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found.' }, { status: 404 })
      const mine = new Set((auth.memberships || []).map((m) => m.agency_id))
      if (!mine.has(agencyId)) {
        return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency.' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'Agency check failed.' }, { status: 500 })
    }
  }

  const fileName = file.name || 'financial-document'
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const stamp = Date.now()
  const storagePath = `financial-files/${listingId || 'pending'}/${stamp}-${Math.random().toString(36).slice(2, 7)}-${safeName}`
  const bytes = Buffer.from(await file.arrayBuffer())

  // 1) Persist the file (storage + financial_documents row when a listing exists).
  const { error: upErr } = await supabase.storage
    .from(FF_BUCKET)
    .upload(storagePath, bytes, { cacheControl: '3600', upsert: false, contentType: file.type || undefined })
  if (upErr) return NextResponse.json({ ok: false, error: `Upload failed: ${upErr.message}` }, { status: 500 })
  const { data: urlData } = supabase.storage.from(FF_BUCKET).getPublicUrl(storagePath)

  let docId: string | null = null
  if (listingId) {
    const { data: doc, error: docErr } = await supabase
      .from('financial_documents')
      .insert({
        deal_id: null,
        listing_id: listingId,
        file_name: fileName,
        file_url: urlData?.publicUrl || null,
        storage_path: storagePath,
        file_size: bytes.byteLength,
        mime_type: file.type || null,
        file_kind: fileKindOf(fileName),
        category: autoTagCategory(fileName),
        status: 'pending',
        uploaded_by: auth.user.id,
      })
      .select('id')
      .single()
    if (docErr) {
      // Non-fatal — the extraction can still return financials for pre-fill.
      console.error('[financial-import] doc row failed:', docErr.message)
    } else {
      docId = doc?.id || null
    }
  }

  // 2) Extract text (PDF + plain text supported server-side; CSV too).
  let extracted = { text: '' }
  try {
    extracted = await extractDocumentText({ fileName, mime: file.type, data: bytes })
  } catch {
    extracted = { text: '' }
  }

  // 3) Analyze — DeepSeek-backed structured extraction with filename fallback.
  let analysis = null
  if (extracted.text.trim() && isClaudeConfigured()) {
    try {
      analysis = await analyzeDocumentText({
        fileName,
        text: extracted.text,
        hints: { guessedType: detectUniversalDocType(fileName) },
      })
    } catch {
      analysis = null
    }
  }
  if (!analysis) {
    const type = detectUniversalDocType(fileName)
    const yearMatch = fileName.match(/(19|20)\d{2}/)
    analysis = {
      fileName,
      type,
      typeLabel: type.replace(/_/g, ' '),
      confidence: 0.4,
      revenueTotal: null,
      expenseTotal: null,
      assets: null,
      liabilities: null,
      sde: null,
      ebitda: null,
      years: [],
      ratios: [],
      trends: [],
      tags: [type.replace(/_/g, ' '), 'no-parseable-text', yearMatch ? `FY ${yearMatch[0]}` : ''].filter(Boolean),
      lineItems: [],
      crossCheck: { entityName: null, entityMatch: 'unknown', signature: 'n/a', periodCovered: null, flags: [] },
      summary: extracted.text.trim()
        ? 'Analysis unavailable — the file was uploaded but could not be fully parsed.'
        : 'No parseable text found (scanned image or unsupported format). Type inferred from the filename.',
    }
  }

  const latestYear = analysis.years && analysis.years.length
    ? [...analysis.years].sort((a, b) => (b.year || 0) - (a.year || 0))[0]
    : null

  return NextResponse.json({
    ok: true,
    docId,
    financials: {
      fileName,
      type: analysis.type,
      typeLabel: analysis.typeLabel,
      revenueTotal: analysis.revenueTotal ?? latestYear?.revenue ?? null,
      expenseTotal: analysis.expenseTotal ?? null,
      sde: analysis.sde ?? null,
      ebitda: analysis.ebitda ?? null,
      latestYear: latestYear?.year ?? null,
      latestYearRevenue: latestYear?.revenue ?? null,
      tags: analysis.tags || [],
      summary: analysis.summary || '',
    },
  })
}
