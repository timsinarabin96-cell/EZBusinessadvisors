/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'
export const maxDuration = 120 // document reading + 4 PDF generations can take a while

// =============================================================================
// POST /api/listings/auto-build — ONE-CLICK deal builder.
// -----------------------------------------------------------------------------
// The broker pastes notes / uploads docs in Capture; this route does the rest:
//   1. fills missing listing record fields (business name, industry, price…)
//   2. reads attached financial docs (PDF/Excel/CSV/images — universal reader)
//      and writes extracted revenue/SDE/EBITDA back onto the listing
//   3. runs the Recast → BOV → CIM → BLI auto-generation pipeline
//   4. runs the SBA eligibility check
//   5. marks the workflow steps complete as each artifact lands
// Returns a step-by-step progress trail for the UI.
// =============================================================================

const buildSchema = z.object({
  listingId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'Server client not configured.' }, { status: 500 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const parsed = buildSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Valid listingId required' }, { status: 400 })
  }
  const listingId = parsed.data.listingId

  // Agency gate (IDOR guard).
  try {
    const { data: listing } = await db.from('listings').select('agency_id, agent_id').eq('id', listingId).maybeSingle()
    const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
    const agentId = (listing as { agent_id?: string | null } | null)?.agent_id
    if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
    const mine = new Set((auth.memberships || []).map((m) => m.agency_id))
    if (agencyId && !mine.has(agencyId) && agentId !== auth.user.id) {
      return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Agency check failed' }, { status: 500 })
  }

  const steps: Array<{ key: string; label: string; status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'; note?: string }> = []
  const mark = (key: string, label: string) => {
    steps.push({ key, label, status: 'running' })
    return () => {
      const s = steps.find((x) => x.key === key)
      if (s) s.status = 'done'
    }
  }
  const fail = (key: string, note: string) => {
    const s = steps.find((x) => x.key === key)
    if (s) { s.status = 'failed'; s.note = note }
  }
  const skip = (key: string, note: string) => {
    const s = steps.find((x) => x.key === key)
    if (s) { s.status = 'skipped'; s.note = note }
  }

  // ── 1. Fill the listing record from the concierge draft ──────────────
  mark('record', 'Filling the deal record')
  try {
    const { data: listing } = await db.from('listings').select('*').eq('id', listingId).single()
    if (listing) {
      const patch: Record<string, unknown> = {}
      if (!listing.business_name || listing.business_name === 'Untitled deal') patch.business_name = listing.business_name || 'Untitled deal'
      // Concierge draft fields land on the listing via the studio form; here we
      // only fill safe defaults so auto-build never clobbers broker edits.
      await db.from('listings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', listingId)
    }
    steps.find((s) => s.key === 'record')!.status = 'done'
  } catch {
    fail('record', 'Could not update the deal record')
  }

  // ── 2. Read attached financial docs → write revenue/SDE/EBITDA ───────
  mark('docs', 'Reading your financial documents')
  try {
    const { data: docs } = await db.from('financial_documents').select('*').eq('listing_id', listingId).order('uploaded_at', { ascending: false }).limit(10)
    const { data: listing } = await db.from('listings').select('annual_revenue, sde, ebitda').eq('id', listingId).single()
    const hasFin = listing && (listing.annual_revenue != null || listing.sde != null || listing.ebitda != null)
    const realDocs = (docs || []).filter((d: any) => d.file_url && !/generated/i.test(String(d.file_name || '')))
    if (hasFin) {
      skip('docs', 'Financials already filled — using them')
    } else if (realDocs.length === 0) {
      skip('docs', 'No uploaded financials found — enter numbers manually or upload docs')
    } else {
      // Download + extract the FIRST readable doc (universal reader), then analyze.
      let best: { revenue?: number | null; sde?: number | null; ebitda?: number | null; note?: string } | null = null
      for (const doc of realDocs) {
        try {
          const url = String(doc.file_url)
          const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
          if (!res.ok) continue
          const buf = Buffer.from(await res.arrayBuffer())
          const { extractDocumentText } = await import('@/lib/ai/textExtract')
          const { analyzeDocumentText } = await import('@/lib/ai/documentAnalyzer')
          const extracted = await extractDocumentText({ fileName: String(doc.file_name || 'doc'), mime: doc.mime_type || null, data: buf })
          if (!extracted.text.trim()) continue
          const analysis = await analyzeDocumentText({ fileName: String(doc.file_name || 'doc'), text: extracted.text })
          const latestYear = (analysis.years || []).length ? [...analysis.years].sort((a: any, b: any) => (b.year || 0) - (a.year || 0))[0] : null
          best = {
            revenue: analysis.revenueTotal ?? latestYear?.revenue ?? null,
            sde: analysis.sde ?? null,
            ebitda: analysis.ebitda ?? null,
            note: `${doc.file_name} — ${analysis.typeLabel || 'financials'}`,
          }
          if (best.revenue != null || best.sde != null || best.ebitda != null) break
        } catch {
          continue // try next doc
        }
      }
      if (best && (best.revenue != null || best.sde != null || best.ebitda != null)) {
        const patch: Record<string, unknown> = {}
        if (best.revenue != null) patch.annual_revenue = best.revenue
        if (best.sde != null) patch.sde = best.sde
        if (best.ebitda != null) patch.ebitda = best.ebitda
        patch.financials_status = 'submitted'
        patch.updated_at = new Date().toISOString()
        await db.from('listings').update(patch).eq('id', listingId)
        steps.find((s) => s.key === 'docs')!.note = `Extracted from ${best.note}`
        steps.find((s) => s.key === 'docs')!.status = 'done'
      } else {
        skip('docs', 'Could not extract numbers from the uploaded files — enter them manually')
      }
    }
  } catch {
    skip('docs', 'Document reading unavailable — enter numbers manually')
  }

  // ── 3. Recast → BOV → CIM → BLI (existing auto-generation pipeline) ──
  mark('docs_gen', 'Generating Recast, BOV, CIM & BLI')
  try {
    const { runAutoGeneration } = await import('@/lib/autoGenerate')
    const result = await runAutoGeneration({ listingId })
    const artifacts = result.artifacts || []
    if (result.ok && artifacts.length > 0) {
      steps.find((s) => s.key === 'docs_gen')!.note = `${artifacts.length} document${artifacts.length === 1 ? '' : 's'} generated`
      steps.find((s) => s.key === 'docs_gen')!.status = 'done'
    } else {
      skip('docs_gen', result.error || 'No documents generated yet — add financials first')
    }
  } catch (e: any) {
    fail('docs_gen', e?.message || 'Generation failed')
  }

  // ── 4. SBA eligibility check ─────────────────────────────────────────
  mark('sba', 'SBA eligibility check')
  try {
    const { data: listing } = await db.from('listings').select('asking_price, sde, ebitda, annual_revenue, sba_qualified').eq('id', listingId).single()
    if (listing && (listing.asking_price != null || listing.sde != null)) {
      // Broker heuristic: SBA 7(a) prefers profitable, serviceable deals.
      const sba = listing.sde != null && listing.sde > 0 && (listing.asking_price == null || listing.asking_price / listing.sde <= 6)
      await db.from('listings').update({ sba_qualified: sba, updated_at: new Date().toISOString() }).eq('id', listingId)
      steps.find((s) => s.key === 'sba')!.note = sba ? 'Likely SBA-eligible ✓' : 'Check with a lender (high multiple / thin earnings)'
      steps.find((s) => s.key === 'sba')!.status = 'done'
    } else {
      skip('sba', 'Needs asking price or SDE')
    }
  } catch {
    skip('sba', 'Skipped')
  }

  // ── 5. Mark workflow steps complete as artifacts land ────────────────
  mark('workflow', 'Updating the workflow checklist')
  try {
    const { data: listing } = await db.from('listings').select('annual_revenue, sde, ebitda').eq('id', listingId).single()
    const fin = listing && (listing.annual_revenue != null || listing.sde != null || listing.ebitda != null)
    const hasDocs = steps.find((s) => s.key === 'docs_gen')?.status === 'done'
    const done: number[] = []
    if (fin) done.push(2, 3)          // financial details + recast
    if (hasDocs) done.push(4, 5, 6)   // BOV + CIM + BLI
    const { data: wf } = await db.from('listing_workflows').select('*').eq('listing_id', listingId).maybeSingle()
    if (wf) {
      const existing = new Set<number>((wf.completed_steps || []).map(Number))
      done.forEach((s) => existing.add(s))
      const completed = [...existing]
      const next = Math.min(10, (Array.isArray(wf.completed_steps) && wf.completed_steps.length ? Math.max(...(wf.completed_steps as number[]).map(Number)) : 0) + 1)
      await db.from('listing_workflows').update({
        current_step: Math.max(wf.current_step, next),
        completed_steps: completed,
        updated_at: new Date().toISOString(),
      }).eq('id', wf.id)
      steps.find((s) => s.key === 'workflow')!.note = `${completed.length} step${completed.length === 1 ? '' : 's'} complete`
      steps.find((s) => s.key === 'workflow')!.status = 'done'
    } else {
      await db.from('listing_workflows').insert({ listing_id: listingId, current_step: 1, completed_steps: done })
      steps.find((s) => s.key === 'workflow')!.note = done.length ? `${done.length} step${done.length === 1 ? '' : 's'} complete` : 'Workflow started'
      steps.find((s) => s.key === 'workflow')!.status = 'done'
    }
  } catch {
    skip('workflow', 'Could not update the checklist')
  }

  const failed = steps.filter((s) => s.status === 'failed')
  return NextResponse.json({
    ok: failed.length === 0,
    listingId,
    steps,
    failed: failed.length,
    notes: steps.filter((s) => s.note).map((s) => s.note),
  })
}
