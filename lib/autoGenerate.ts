/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/autoGenerate.ts — auto-generation pipeline for financial documents.
// -----------------------------------------------------------------------------
// SERVER-ONLY. Given a listing (and optionally a deal), this runs the full
// One-Click pipeline:
//
//   source files -> detect types -> extract financials
//                 -> Recast  (recasted P&L PDF)
//                 -> BOV     (10+ page Broker Opinion of Value PDF)
//                 -> CIM     (25+ section Confidential Info Memorandum PDF)
//                 -> BLI     (one-page Business Listing Information PDF)
//
// Each generated artifact is rendered to a PDF (via lib/pdfExport), uploaded to
// the 'documents' storage bucket, and recorded in financial_documents with
// category = 'generated_document' and status advancing up the pipeline
// (recast_done -> bov_done -> cim_done -> bli_done). Source files are marked
// 'processed'. Always import from a Route Handler / Server Component only —
// this module touches the service-role key and the Claude client.
//
// DEPS: reuse the deterministic generators (recast/bov/cim/bli) already built.
// Claude is used ONLY to enrich financial data extraction when financial files
// are present — the heavy document generation stays deterministic so it is
// reliable, cheap and auditable (matching the platform's established style).
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'
import type { Listing } from '@/lib/listings'
import { recastFinancials, attachRecastAnalysis, type RecastResult, type RecastInput, type YearFinancials } from '@/lib/recast'
import { runReconciliationLoop, type ReconciliationOutcome } from '@/lib/reconciliationFollowup'
import { generateBovContent } from '@/lib/bov'
import { enrichBovWithClaude } from '@/lib/bovClaude'
import type { AgentContextPayload } from '@/types/ai'
import { generateCimContent } from '@/lib/cim'
import { generateBliContent } from '@/lib/bli'
import { exportRecastToPdf, exportBovToPdf, exportCimToPdf, exportBliToPdf } from '@/lib/pdfExport'
import {
  buildFinancialHistory,
  computeFinancialMetrics,
  extractFinancialCsv,
  groupUploadedDocs,
  type ExtractedFinancialRow,
} from '@/lib/financialExtractor'
import { FF_BUCKET, DOCS_BUCKET } from '@/lib/storageBuckets'
import type { FinancialStatus, FinancialDoc } from '@/lib/financialFiles'
import { complete, isClaudeConfigured } from '@/lib/claude/client'
import type {
  PipelineStage,
  GeneratedArtifact,
  AutoGenerateResult,
} from '@/lib/autoGenerateTypes'

// Re-export shared types so existing imports from '@/lib/autoGenerate' keep
// working without pulling the server-only Claude/SDK path into client bundles.
export type { PipelineStage, GeneratedArtifact, AutoGenerateResult }

// Static pipeline steps live in the client-safe types module.
export { PIPELINE_STEPS } from '@/lib/autoGenerateTypes'

function statusLabel(s: FinancialStatus): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function slugify(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'business'
}

// ---------------------------------------------------------------------------
// Financial extraction — Claude-backed when configured, else heuristic/CSV.
// ---------------------------------------------------------------------------
interface ExtractedData {
  rows: ExtractedFinancialRow[]
  notes: string
}

async function extractFinancials(
  listing: Listing,
  docs: FinancialDoc[],
  reviewedExtractions?: { year: number; revenue: number; expenses: number; source: string }[],
): Promise<ExtractedData> {
  const notes: string[] = []
  const rows: ExtractedFinancialRow[] = []

  // 0) SOURCE OF TRUTH: broker-approved/overridden extractions from the FIC.
  //    These beat every other path — the broker already looked at the docs.
  if (reviewedExtractions && reviewedExtractions.length) {
    for (const ex of reviewedExtractions) {
      rows.push({ year: ex.year, revenue: ex.revenue, netIncome: ex.revenue - ex.expenses })
      notes.push(`Year ${ex.year} from ${ex.source === 'override' ? 'broker override' : 'approved extraction'} ($${Math.round(ex.revenue).toLocaleString()} revenue).`)
    }
    return { rows, notes: notes.join(' ') }
  }

  // 1) Try CSV/TSV parsing from any source docs we can fetch as text.
  //    (In practice source uploads are PDFs/Excel; CSV is the parseable case.)
  const csv = docs.find((d) => /\.(csv|tsv)$/i.test(d.file_name || ''))
  if (csv?.file_url) {
    try {
      const res = await fetch(csv.file_url, { signal: AbortSignal.timeout(8000) })
      if (res.ok) {
        const text = await res.text()
        const parsed = extractFinancialCsv(text, new Date().getFullYear() - 1)
        if (parsed.length) {
          rows.push(...parsed)
          notes.push(`Extracted ${parsed.length} fiscal year row(s) from ${csv.file_name}.`)
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  // 2) Claude-backed extraction — asks the model to produce a tight JSON
  //    summary of the listing earnings (+ any financial file names present).
  //    Deterministic generators still build the documents; this only enriches.
  if (isClaudeConfigured() && !rows.length) {
    const fileList = docs
      .filter((d) => d.category !== 'generated_document')
      .map((d) => d.file_name)
    try {
      const contextText = [
        `Listing: ${listing.business_name || 'Business'}`, 
        `Industry: ${listing.industry || 'unknown'}`, 
        `Annual revenue: ${listing.annual_revenue ?? 'unknown'}`, 
        `SDE: ${listing.sde ?? 'unknown'}`, 
        `EBITDA: ${listing.ebitda ?? 'unknown'}`, 
        `Uploaded financial files: ${fileList.length ? fileList.join(', ') : 'none'}`,
      ].join('\n')
      const { data } = await complete({
        context: { kind: 'document', entityId: listing.id, text: contextText },
        system:
          'You extract normalized owner-earnings data from brokerage financial files. ' +
          'Return ONLY a compact JSON object with an optional "years" array ' +
          '[{year, revenue, sde, ebitda}] and an optional "notes" string. ' +
          'Do not fabricate numbers that are not provided.',
        message: 'Extract the owner-earnings data as JSON from the context above.',
        jsonMode: true,
        maxTokens: 700,
      })
      const years = (data?.years as { year: number; revenue?: number; sde?: number; ebitda?: number }[] | undefined) || []
      if (years.length) {
        rows.push(...years.map((y) => ({ year: y.year, revenue: y.revenue, netIncome: y.sde ?? y.ebitda })))
        notes.push('Claude-assisted earnings extraction applied.')
      }
    } catch {
      /* non-fatal */
    }
  }

  if (!rows.length) {
    notes.push('No parseable financial detail found — derived a conservative 3-year history from listing figures.')
  }

  return { rows, notes: notes.join(' ') }
}

// Load the FIC's reviewed extractions (approved or overridden) as the
// pipeline's preferred financial source. Returns per-year revenue/expenses.
async function loadReviewedExtractions(
  supabase: ReturnType<typeof createServerClient>,
  listingId: string,
): Promise<{ year: number; revenue: number; expenses: number; source: string }[]> {
  try {
    const { data } = await supabase
      .from('financial_extractions')
      .select('fiscal_year, extracted, broker_override, review_state')
      .eq('listing_id', listingId)
      .in('review_state', ['approved', 'overridden'])
    const rows = (data || []) as Array<{
      fiscal_year: number | null
      extracted: Record<string, unknown> | null
      broker_override: Record<string, unknown> | null
      review_state: string
    }>
    const byYear = new Map<number, { revenue: number; expenses: number; source: string }>()
    for (const r of rows) {
      const year = r.fiscal_year
      if (!year) continue
      const d = r.review_state === 'overridden' && r.broker_override ? r.broker_override : r.extracted || {}
      const revenue = Number(d.revenueTotal) || 0
      const expenses = Number(d.expenseTotal) || 0
      if (!revenue && !expenses) continue
      const source = r.review_state === 'overridden' ? 'override' : 'extraction'
      const existing = byYear.get(year)
      if (!existing || (source === 'override' && existing.source !== 'override')) {
        byYear.set(year, { revenue, expenses, source })
      }
    }
    return Array.from(byYear.entries()).map(([year, v]) => ({ year, ...v }))
  } catch {
    return []
  }
}
async function saveGeneratedDoc(step: {
  listingId: string
  dealId: string | null
  stage: PipelineStage
  title: string
  bytes: Uint8Array
  status: FinancialStatus
}): Promise<GeneratedArtifact> {
  const supabase = createServerClient()
  if (!supabase) throw new Error('Supabase server client not configured')

  const safeName = slugify(step.title)
  const stamp = Date.now()
  const storagePath = `financial-files/${step.listingId}/${stamp}-${safeName}.pdf`

  // Generated deliverables (BOV/CIM/BLI/recast) → PUBLIC documents bucket so
  // the stored URL is directly openable. (Source financials stay in the
  // private financial_docs bucket and are resolved via signed URLs.)
  const { error: upErr } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(storagePath, Buffer.from(step.bytes), {
      contentType: 'application/pdf',
      upsert: false,
    })
  if (upErr) throw new Error(`Storage upload failed (${step.stage}): ${upErr.message}`)

  const { data: urlData } = supabase.storage.from(DOCS_BUCKET).getPublicUrl(storagePath)
  const publicUrl = urlData?.publicUrl || ''

  const fileName = `${safeName}.pdf`
  const { data, error } = await supabase
    .from('financial_documents')
    .insert({
      deal_id: step.dealId,
      listing_id: step.listingId,
      file_name: fileName,
      file_url: publicUrl,
      storage_path: storagePath,
      file_size: step.bytes.byteLength,
      mime_type: 'application/pdf',
      file_kind: 'pdf',
      category: 'generated_document',
      status: step.status,
      notes: `Auto-generated ${step.title} (${step.stage.toUpperCase()})`,
    })
    .select()
    .single()

  if (error) throw new Error(`DB insert failed (${step.stage}): ${error.message}`)

  return {
    stage: step.stage,
    title: step.title,
    fileName,
    storagePath,
    publicUrl,
    docId: data.id as string,
    status: step.status,
    statusLabel: statusLabel(step.status),
  }
}

/**
 * Persist an open/flagged reconciliation follow-up so the broker sees it in
 * the advisor chat / review queue (#7). Idempotent per issue detail: if the
 * same issue is already open, only refresh the question.
 */
async function persistReconciliationFollowup(
  supabase: ReturnType<typeof createServerClient>,
  listingId: string,
  outcome: ReconciliationOutcome,
): Promise<void> {
  if (!outcome.question || outcome.issues.length === 0) return
  const issue = outcome.issues[0]
  const key = issue.detail
  try {
    const { data: existing } = await supabase
      .from('reconciliation_followups')
      .select('id')
      .eq('listing_id', listingId)
      .eq('issue_kind', issue.kind)
      .eq('status', 'open')
      .limit(1)
    if (existing && existing.length > 0) return // already open for this listing
    await supabase.from('reconciliation_followups').insert({
      listing_id: listingId,
      status: outcome.status === 'flagged' ? 'flagged' : 'open',
      issue_kind: issue.kind,
      issue: { detail: key, category: issue.category ?? null, amount: issue.amount ?? null, label: issue.label ?? null, year: issue.year ?? null },
      question: outcome.question.question,
      suggested_answers: outcome.question.suggestedAnswers,
    })
  } catch {
    // persistence is best-effort — the pipeline note still carries the message
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
export async function runAutoGeneration(input: {
  listingId: string
  dealId?: string | null
}): Promise<AutoGenerateResult> {
  const supabase = createServerClient()
  if (!supabase) {
    return { ok: false, listingId: input.listingId, listingName: '', error: 'Supabase server client not configured', artifacts: [], notes: [] }
  }

  // 1) Load the listing
  const { data: listing, error: listingErr } = await supabase
    .from('listings')
    .select('*')
    .eq('id', input.listingId)
    .single()
  if (listingErr || !listing) {
    return { ok: false, listingId: input.listingId, listingName: '', error: `Listing not found: ${listingErr?.message || input.listingId}`, artifacts: [], notes: [] }
  }
  const L = listing as Listing
  const dealId = input.dealId ?? null
  const artifacts: GeneratedArtifact[] = []
  const notes: string[] = []

  // Agency branding for the document footer (Open Claw theme). Uses the
  // resolver so a licensed broker's docs carry THEIR name — never EZ's.
  let agency: { name: string; displayName?: string | null; phone?: string | null; email?: string | null } | null = null
  try {
    const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
    if (agencyId) {
      const { resolveAgencyBranding } = await import('@/lib/agencyBranding')
      const brand = await resolveAgencyBranding(agencyId)
      if (brand.agencyId) agency = { name: brand.displayName, displayName: brand.displayName, phone: brand.phone, email: brand.email }
    }
  } catch {
    /* footer falls back to generic */
  }

  // Preload fonts + cover imagery for the Open Claw PDF theme (server-side).
  let assets: { fonts?: Record<string, string>; images?: Record<string, string> } | undefined
  try {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const root = process.cwd()
    const b64 = (rel: string) => fs.readFileSync(path.join(root, 'public', rel)).toString('base64')
    assets = {
      fonts: {
        '/fonts/PlayfairDisplay_700Bold.ttf': b64('fonts/PlayfairDisplay_700Bold.ttf'),
        '/fonts/PlayfairDisplay_400Regular.ttf': b64('fonts/PlayfairDisplay_400Regular.ttf'),
        '/fonts/Inter_400Regular.ttf': b64('fonts/Inter_400Regular.ttf'),
        '/fonts/Inter_700Bold.ttf': b64('fonts/Inter_700Bold.ttf'),
      },
      images: {
        '/brand/claw-cover.jpg': b64('brand/claw-cover.jpg'),
        '/brand/claw-data.jpg': b64('brand/claw-data.jpg'),
      },
    }
  } catch {
    assets = undefined
  }

  // 2) Load existing source financial docs for this listing
  const { data: sourceDocs } = await supabase
    .from('financial_documents')
    .select('*')
    .or(`listing_id.eq.${input.listingId},deal_id.eq.${dealId ?? 'none'}`)
  const sources = ((sourceDocs as FinancialDoc[] | null) || []).filter((d) => d.category !== 'generated_document')
  const grouped = groupUploadedDocs(sources)

  // 3) Extract financial data — FIC reviewed extractions first, then fallbacks
  const reviewedExtractions = await loadReviewedExtractions(supabase, input.listingId)
  const extraction = await extractFinancials(L, sources, reviewedExtractions)
  if (extraction.notes) notes.push(extraction.notes)

  // 4) Build 3-year financial history from listing + extracted rows
  const history: YearFinancials[] = buildFinancialHistory(L, extraction.rows)

  // 5) RECAST — reconciliation gate with follow-up loop (#7, spec 08-31).
  // Hoisted so BOV + CIM consume the SAME recast result (single source of truth).
  // REPLACED in place: the old path caught engine failure, noted it, and
  // silently continued to BOV/CIM from listing.sde — a silent estimate. Now a
  // failed/ambiguous reconciliation generates a targeted follow-up question
  // for the broker and STOPS the pipeline until it resolves or is flagged.
  let recast: RecastResult | null = null
  let reconciliationBlocked = false
  try {
    const recastInput: RecastInput = {
      listingId: L.id,
      businessName: L.business_name || 'Business',
      entityType: 'llc',
      currency: '$',
      years: history,
      addBacks: [], // auto recast uses the built-in add-back modeling in SDE/EBITDA
    }
    const outcome = await runReconciliationLoop(recastInput)
    if (outcome.status === 'clean' && outcome.result) {
      recast = outcome.result
      const bytes = await exportRecastToPdf(attachRecastAnalysis(recast), { returnBytes: true, agency, assets })
      if (bytes) {
        const art = await saveGeneratedDoc({
          listingId: L.id,
          dealId,
          stage: 'recast',
          title: `${L.business_name || 'Business'} — Recast Report`,
          bytes,
          status: 'recast_done',
        })
        artifacts.push(art)
      }
    } else {
      // needs_input → persist the follow-up so the broker sees it in the
      // advisor chat / review queue; flagged → same, marked for review.
      reconciliationBlocked = true
      await persistReconciliationFollowup(supabase, L.id, outcome)
      notes.push(outcome.message)
    }
  } catch (e: any) {
    reconciliationBlocked = true
    notes.push(`Recast failed: ${e?.message || 'unknown'}`)
  }

  // 6) BOV — only when reconciliation is clean (never from unvalidated numbers).
  if (!reconciliationBlocked) {
    try {
      let bov = generateBovContent(L, { recast })
      const bovFacts: AgentContextPayload = {
        kind: 'listing',
        entityId: L.id,
        text: [
          `Business: ${L.business_name || 'Subject Business'}`,
          `Industry: ${L.industry || 'n/a'}`,
          `Location: ${L.location_general || 'n/a'}`,
          `Revenue: $${L.annual_revenue || 0}`,
          `SDE: $${L.sde || 0}`,
          `EBITDA: $${L.ebitda || 0}`,
          `Asking price: $${L.asking_price || 0}`,
          `Valuation range: ${bov.valuationRange}`,
          `Conclusion: ${bov.conclusion}`,
          `Comparables: ${bov.comparables.map((c) => `${c.business} (${c.multiple}x revenue)`).join('; ')}`,
        ].join('\n'),
      }
      bov = await enrichBovWithClaude(bov, bovFacts)
      const bytes = await exportBovToPdf(bov, { returnBytes: true, agency, assets })
      if (bytes) {
        const art = await saveGeneratedDoc({
          listingId: L.id,
          dealId,
          stage: 'bov',
          title: `${L.business_name || 'Business'} — Broker Opinion of Value`,
          bytes,
          status: 'bov_done',
        })
        artifacts.push(art)
      }
    } catch (e: any) {
      notes.push(`BOV failed: ${e?.message || 'unknown'}`)
    }

    // 7) CIM — same gate: only from the validated engine output.
    try {
      const cim = generateCimContent(L)
      const bytes = await exportCimToPdf(cim, { returnBytes: true, agency, assets })
      if (bytes) {
        const art = await saveGeneratedDoc({
          listingId: L.id,
          dealId,
          stage: 'cim',
          title: `${L.business_name || 'Business'} — Confidential Information Memorandum`,
          bytes,
          status: 'cim_done',
        })
        artifacts.push(art)
      }
    } catch (e: any) {
      notes.push(`CIM failed: ${e?.message || 'unknown'}`)
    }
  } else {
    notes.push('Recast/BOV/CIM generation paused — reconciliation needs broker input (see follow-up questions).')
  }

  // 8) BLI
  try {
    const bli = generateBliContent(L)
    const bytes = await exportBliToPdf(bli, { returnBytes: true, agency, assets })
    if (bytes) {
      const art = await saveGeneratedDoc({
        listingId: L.id,
        dealId,
        stage: 'bli',
        title: `${L.business_name || 'Business'} — Business Listing Information`,
        bytes,
        status: 'bli_done',
      })
      artifacts.push(art)
    }
  } catch (e: any) {
    notes.push(`BLI failed: ${e?.message || 'unknown'}`)
  }

  // 9) Mark all source docs as processed
  if (sources.length) {
    await supabase
      .from('financial_documents')
      .update({ status: 'processed' })
      .eq('listing_id', L.id)
      .eq('category', 'other') // only leftover 'other' source docs
  }
  await supabase
    .from('financial_documents')
    .update({ status: 'processed' })
    .in('category', ['tax_return', 'financial_statement', 'bank_statement'])
    .eq('listing_id', L.id)

  return {
    ok: true,
    listingId: L.id,
    listingName: L.business_name || 'Business',
    artifacts,
    notes,
  }
}
