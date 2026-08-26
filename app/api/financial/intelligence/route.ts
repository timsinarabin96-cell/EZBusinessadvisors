/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { FF_BUCKET } from '@/lib/financialFiles'
import { analyzeDocumentText, detectUniversalDocType } from '@/lib/ai/documentAnalyzer'
import { extractDocumentText, isPlainTextType } from '@/lib/ai/textExtract'
import { mergeAnalyses, type AiExtractionOutput } from '@/lib/ai/financialExtractor'
import { generateFinancialSummary, type FinancialSummaryReport } from '@/lib/ai/summaryGenerator'
import type { FinancialIntelligence, DocumentAnalysis } from '@/lib/ai/types'
import { isFinancialIntelligenceEnabled, financialAddonError } from '@/lib/financialAddon'

export const runtime = 'nodejs'

const schema = z.object({ listingId: z.string().uuid(), fiscalYear: z.number().int().min(1).max(5).nullable().optional() })

function bearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  if (!supabase) return NextResponse.json({ ok: false, error: 'Server client not configured.' }, { status: 500 })

  const token = bearerToken(req)
  if (!token) return NextResponse.json({ ok: false, error: 'Missing authorization header.' }, { status: 401 })
  const { data: auth, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !auth?.user) return NextResponse.json({ ok: false, error: 'Invalid or expired session.' }, { status: 401 })

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await req.json())
  } catch {
    return NextResponse.json({ ok: false, error: 'Validation failed: listingId (uuid) required.' }, { status: 422 })
  }
  const { listingId, fiscalYear } = parsed

  // Agency gate: caller must belong to the listing's agency (IDOR guard).
  try {
    const { data: listingMeta } = await supabase.from('listings').select('agency_id').eq('id', listingId).maybeSingle()
    const agencyId = (listingMeta as { agency_id?: string | null } | null)?.agency_id
    if (!agencyId) return NextResponse.json({ ok: false, error: 'Listing not found.' }, { status: 404 })
    const { data: memberships } = await supabase.from('agency_members').select('agency_id').eq('profile_id', auth.user.id)
    const mine = new Set((memberships || []).map((m) => m.agency_id))
    if (!mine.has(agencyId)) {
      return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency.' }, { status: 403 })
    }

    // Financial Intelligence add-on gate ($100/mo upsell — enforce server-side).
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
    const enabled = await isFinancialIntelligenceEnabled(agencyId, (profile as { role?: string | null } | null)?.role)
    if (!enabled) {
      return NextResponse.json(financialAddonError(), { status: 403 })
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Agency check failed.' }, { status: 500 })
  }

  // 1) Load listing
  const { data: listing, error: lErr } = await supabase
    .from('listings').select('id, business_name, asking_price, annual_revenue, sde, ebitda').eq('id', listingId).maybeSingle()
  if (lErr || !listing) {
    return NextResponse.json({ ok: false, error: 'Listing not found.' }, { status: 404 })
  }
  const name = listing.business_name || 'Business'

  // 2) Load source financial documents
  const { data: docs, error: dErr } = await supabase
    .from('financial_documents')
    .select('*')
    .eq('listing_id', listingId)
    .neq('category', 'generated_document')
    .limit(30)
  if (dErr) return NextResponse.json({ ok: false, error: 'Failed to load documents.' }, { status: 500 })
  const sourceDocs = (docs || []) as any[]

  // 3) Download + extract text for each (OCR fallback for scans) + persist
  const analyses: DocumentAnalysis[] = []
  const perDocExtractions: { documentId: string; docType: string; confidence: number; extracted: unknown }[] = []
  for (const doc of sourceDocs) {
    const storagePath = doc.storage_path || doc.file_url
    if (!storagePath || storagePath.startsWith('http')) {
      // Already public URL with no storage path — skip, or note.
      const fallback = await analyzeFileNameOnly(doc.file_name)
      if (fallback) {
        analyses.push(fallback)
        perDocExtractions.push({ documentId: doc.id, docType: fallback.type, confidence: fallback.confidence, extracted: fallback })
      }
      continue
    }
    const { data: blob, error: dlErr } = await supabase.storage
      .from(FF_BUCKET)
      .download(storagePath)
    if (dlErr || !blob) continue

    const buf = Buffer.from(await blob.arrayBuffer())
    const extracted = await extractDocumentText({
      fileName: doc.file_name,
      mime: doc.mime_type,
      data: buf,
    })

    if (extracted.text.trim()) {
      try {
        const analysis = await analyzeDocumentText({
          fileName: doc.file_name,
          text: extracted.text,
          hints: { guessedType: detectUniversalDocType(doc.file_name) },
        })
        analyses.push(analysis)
        perDocExtractions.push({ documentId: doc.id, docType: analysis.type, confidence: analysis.confidence, extracted: analysis })
        continue
      } catch {
        // Claude unavailable/failed → fall through to heuristic analysis
      }
    }
    const fallback = await analyzeFileNameOnly(doc.file_name)
    if (fallback) {
      analyses.push(fallback)
      perDocExtractions.push({ documentId: doc.id, docType: fallback.type, confidence: fallback.confidence, extracted: fallback })
    }
  }

  // 3b) Persist per-document extractions (multi-year aware) — the universal
  // reader's durable output. Later passes (valuation/BOV/CIM) read these rows.
  for (const ex of perDocExtractions) {
    try {
      await supabase.from('financial_extractions').upsert(
        {
          document_id: ex.documentId,
          listing_id: listingId,
          fiscal_year: fiscalYear ?? null,
          doc_type: ex.docType,
          confidence: Math.round(ex.confidence * 100) / 100,
          extracted: ex.extracted as Record<string, unknown>,
          model: 'claude',
          review_state: 'pending',
        },
        { onConflict: 'document_id' },
      ).select().maybeSingle()
    } catch { /* persistence is best-effort */ }
    // Sync the detected type back onto the document row for the UI.
    try {
      await supabase.from('financial_documents').update({ doc_type: ex.docType }).eq('id', ex.documentId)
    } catch { /* best-effort */ }
  }

  // 4) Merge into broker-grade extraction
  const ext: AiExtractionOutput = mergeAnalyses({
    listingId,
    listingName: name,
    analyses,
    askingPrice: listing.asking_price || 0,
  })

  // 5) Generate comprehensive financial summary
  const report: FinancialSummaryReport = await generateFinancialSummary(ext, name)

  // 6) Assemble the intelligence bundle
  const intelligence: FinancialIntelligence = {
    listingId,
    listingName: name,
    documents: ext.documents,
    revenueByYear: ext.revenueByYear,
    expenses: {},
    sde: ext.sde,
    ebitda: ext.ebitda,
    addBacks: ext.addBacks,
    sdeMultipleLow: ext.sdeMultipleLow,
    sdeMultipleHigh: ext.sdeMultipleHigh,
    valueRangeLow: ext.valueRangeLow,
    valueRangeHigh: ext.valueRangeHigh,
    ratios: ext.ratios,
    trends: ext.trends,
    workingCapital: ext.workingCapital,
    debt: ext.debt,
    summary: report.executiveSummary,
    generatedAt: report.generatedAt,
  }

  return NextResponse.json({
    ok: true,
    listingId,
    listingName: name,
    extraction: ext,
    report,
    intelligence,
  })
}

/**
 * Heuristic, Claude-free analysis for a doc where no text could be read
 * (binary/office/image) — still yields type detection + smart tags.
 */
async function analyzeFileNameOnly(fileName: string): Promise<DocumentAnalysis | null> {
  if (!fileName) return null
  const type = detectUniversalDocType(fileName)
  const yearMatch = fileName.match(/(19|20)\d{2}/)
  return {
    fileName,
    type,
    typeLabel: type,
    confidence: 0.5,
    revenueTotal: 0,
    expenseTotal: 0,
    assets: 0,
    liabilities: 0,
    sde: 0,
    ebitda: 0,
    years: [],
    balances: [],
    ratios: [],
    trends: [],
    tags: [type.replace(/_/g, ' '), 'no-parseable-text', yearMatch ? `FY ${yearMatch[0]}` : ''].filter(Boolean),
    keyMetrics: { parsed: 'no' },
    summary: `Document "${fileName}" could not be text-extracted server-side (likely a scanned/Office file). Type inferred from filename.`,
    raw: '',
  }
}
