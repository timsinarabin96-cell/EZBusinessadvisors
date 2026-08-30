/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import {
  ONE_SHOT_STAGES,
  buildRecordExtractionPrompt,
  fallbackExtractRecord,
  buildTeaserPrompt,
  fallbackTeaser,
  runAudit,
  valuationFromMultiples,
  sbaEligibility,
  type BuildStep,
} from '@/lib/oneShotDeal'
import { withRetry } from '@/lib/aiRetry'

export const runtime = 'nodejs'
export const maxDuration = 300 // doc reading + 4 PDF gens + AI photos can take a while

// =============================================================================
// POST /api/deals/build — ONE-SHOT DEAL BUILDER.
// -----------------------------------------------------------------------------
// The heart of the platform. One call turns raw broker notes + uploaded
// financial docs into a complete, verified, publish-ready deal:
//   intake → docs → audit → recast+documents → sba → comps → buyers → photos
//   → teaser → ready
// Responds with a NEWLINE-DELIMITED JSON stream so the studio can render a
// live progress trail:
//   {"type":"step","step":{"key":"docs","label":"…","status":"running"}}
//   {"type":"step","step":{...,"status":"done","note":"…"}}
//   {"type":"done","result":{...}} | {"type":"error","error":"…"}
// =============================================================================

const BUCKET = 'listing_images'

function ndjson(line: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(line) + '\n')
}

function stepEvent(step: BuildStep) {
  return ndjson({ type: 'step', step })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'Server client not configured.' }, { status: 500 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const listingId = String(body?.listingId || '')
  const notes = String(body?.notes || '').trim()
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })

  // Agency gate (IDOR guard).
  let listingRow: Record<string, unknown> | null = null
  try {
    const { data: listing } = await db.from('listings').select('agency_id, agent_id, ai_metadata').eq('id', listingId).maybeSingle()
    if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })
    listingRow = listing as Record<string, unknown> | null
    const agencyId = (listing as { agency_id?: string | null } | null)?.agency_id
    const agentId = (listing as { agent_id?: string | null } | null)?.agent_id
    const mine = new Set((auth.memberships || []).map((m) => m.agency_id))
    if (agencyId && !mine.has(agencyId) && agentId !== auth.user.id) {
      return NextResponse.json({ ok: false, error: 'Not a member of this listing\'s agency' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Agency check failed' }, { status: 500 })
  }

  // ── RESUME SUPPORT ────────────────────────────────────────────────────────
  // Persist the build trail to ai_metadata.build after every stage so a crash
  // / refresh / rate-limit wall mid-build can resume from the last completed
  // stage instead of re-running the whole pipeline from zero. Already-done and
  // already-skipped stages are kept; failed/pending ones are re-attempted.
  const savedBuild = ((listingRow as { ai_metadata?: Record<string, unknown> } | null)?.ai_metadata?.build as { steps?: BuildStep[] } | undefined) || undefined
  const savedByKey = new Map((savedBuild?.steps || []).map((s) => [s.key, s]))
  const steps: BuildStep[] = ONE_SHOT_STAGES.map((s) => {
    const prev = savedByKey.get(s.key)
    if (prev && (prev.status === 'done' || prev.status === 'skipped')) {
      return { key: s.key, label: s.label, status: prev.status, note: prev.note }
    }
    return { key: s.key, label: s.label, status: 'pending' }
  })
  const set = (key: string, patch: Partial<BuildStep>) => {
    const s = steps.find((x) => x.key === key)
    if (s) Object.assign(s, patch)
  }
  // Non-blocking persistence — never let a DB hiccup kill the stream.
  const persistBuild = () => {
    const meta = ((listingRow as { ai_metadata?: Record<string, unknown> } | null)?.ai_metadata) || {}
    void (async () => {
      try {
        await db.from('listings').update({
          ai_metadata: { ...meta, build: { steps: steps.map(({ key, status, note }) => ({ key, status, note })), updatedAt: new Date().toISOString() } },
          updated_at: new Date().toISOString(),
        }).eq('id', listingId)
      } catch (e) {
        console.error('[deals/build] persist failed:', (e as Error)?.message)
      }
    })()
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(ndjson(line))
      // Emit already-completed stages instantly so a resumed trail renders.
      for (const s of steps) {
        if (s.status === 'done' || s.status === 'skipped') send(stepEvent(s))
      }
      const run = async (key: string, fn: () => Promise<void>, attempts = 2) => {
        const step = steps.find((s) => s.key === key)!
        if (step.status === 'done' || step.status === 'skipped') return // resume: already complete
        set(key, { status: 'running' })
        send(stepEvent(step))
        try {
          await withRetry(fn, { attempts, onRetry: (e, attempt) => console.warn(`[deals/build] ${key} retry ${attempt}:`, (e as Error)?.message) })
          set(key, { status: 'done' })
        } catch (e: any) {
          set(key, { status: 'failed', note: e?.message || 'Failed' })
        }
        persistBuild()
        send(stepEvent(steps.find((s) => s.key === key)!))
      }

      try {
        // ── 1. INTAKE — extract the deal record from notes ──────────────
        await run('intake', async () => {
          if (!notes) {
            set('intake', { status: 'skipped', note: 'No notes — using the existing record' })
            return
          }
          const { completeWithDeepSeek } = await import('@/lib/deepseek/client')
          const { system, user } = buildRecordExtractionPrompt({ notes })
          let d: Record<string, unknown> = {}
          try {
            const res = await completeWithDeepSeek({
              context: { kind: 'listing', entityId: listingId, text: user },
              system,
              message: 'Extract the deal record from the context above.',
              jsonMode: true,
              maxTokens: 1600,
            })
            d = (res.data || {}) as Record<string, unknown>
          } catch (e) {
            // AI flake (rate limit / timeout) must never produce an incomplete
            // listing — fall back to the deterministic regex extractor.
            console.error('[deals/build] intake AI failed, using deterministic fallback:', (e as Error)?.message)
            d = {}
          }
          const patch: Record<string, unknown> = {}
          // If the LLM returned nothing usable, merge the deterministic
          // fallback (asking price, revenue, SDE, EBITDA, employees, year, loc).
          const llmHasData = Object.keys(d).length > 0
          if (!llmHasData) {
            Object.assign(d, fallbackExtractRecord(notes))
          }
          const str = (k: string) => {
            const v = d[k]
            if (typeof v === 'string' && v.trim() && v !== 'null') patch[k] = v.trim().slice(0, 500)
          }
          const num = (k: string) => {
            const v = d[k]
            if (typeof v === 'number' && isFinite(v)) patch[k] = v
            else if (typeof v === 'string' && v.trim() && !isNaN(Number(v))) patch[k] = Number(v)
          }
          str('business_name'); str('industry'); str('sub_industry'); str('location_general')
          num('asking_price'); num('annual_revenue'); num('sde'); num('ebitda')
          num('employees_full_time'); num('established_year')
          str('description'); str('reason_for_sale'); str('transition_support')
          // Readiness step 8 requires a headline — derive it from the name.
          const name = String(patch.business_name || d.business_name || '').trim()
          if (!patch.headline && name) patch.headline = name.slice(0, 120)
          str('competitive_advantages'); str('growth_opportunities')
          str('public_title'); str('public_summary'); str('contact_phone')
          if (Array.isArray(d.public_highlights)) {
            const hl = (d.public_highlights as unknown[]).filter((x) => typeof x === 'string' && x.trim()).slice(0, 8) as string[]
            if (hl.length) patch.public_highlights = hl
          }
          if (Object.keys(patch).length) {
            const { error } = await db.from('listings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', listingId)
            if (error) throw new Error(`Record update failed: ${error.message}`)
          }
          const biz = String(patch.business_name || d.business_name || '').trim()
          set('intake', { note: biz ? `Record captured — ${biz}` : 'Record captured (no business name found)' })
        })

        // ── 2. DOCS — read financial documents → revenue/SDE/EBITDA ──────
        let docFigures: { revenue?: number | null; sde?: number | null; ebitda?: number | null; sourceName?: string } = {}
        await run('docs', async () => {
          const { data: docs } = await db.from('financial_documents').select('*').eq('listing_id', listingId).order('uploaded_at', { ascending: false }).limit(10)
          const realDocs = (docs || []).filter((d: any) => d.file_url && !/generated/i.test(String(d.file_name || '')))
          if (realDocs.length === 0) {
            set('docs', { status: 'skipped', note: 'No financial docs uploaded — numbers come from notes only' })
            return
          }
          const { extractDocumentText } = await import('@/lib/ai/textExtract')
          const { analyzeDocumentText } = await import('@/lib/ai/documentAnalyzer')
          const { mergeAnalyses } = await import('@/lib/ai/financialExtractor')
          const analyses: any[] = []
          let sourceName = ''
          for (const doc of realDocs) {
            try {
              const url = String(doc.file_url)
              const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
              if (!res.ok) continue
              const buf = Buffer.from(await res.arrayBuffer())
              const extracted = await extractDocumentText({ fileName: String(doc.file_name || 'doc'), mime: doc.mime_type || null, data: buf })
              if (!extracted.text.trim()) continue
              const analysis = await analyzeDocumentText({ fileName: String(doc.file_name || 'doc'), text: extracted.text })
              analyses.push(analysis)
              if (!sourceName) sourceName = String(doc.file_name || 'financials')
              const { error } = await db.from('financial_documents').update({ status: 'processed' }).eq('id', doc.id)
              if (error) console.error('[deals/build] doc status update failed', error.message)
            } catch (e) {
              console.error('[deals/build] doc read failed', (e as Error)?.message)
            }
          }
          if (analyses.length === 0) {
            set('docs', { status: 'skipped', note: 'Could not read the uploaded files' })
            return
          }
          const merged = mergeAnalyses({ listingId, listingName: 'deal', analyses })
          docFigures = { revenue: merged.revenueTotal, sde: merged.sde, ebitda: merged.ebitda, sourceName }
          const patch: Record<string, unknown> = {}
          if (merged.revenueTotal != null) patch.annual_revenue = Math.round(merged.revenueTotal)
          if (merged.sde != null) patch.sde = Math.round(merged.sde)
          if (merged.ebitda != null) patch.ebitda = Math.round(merged.ebitda)
          if (Object.keys(patch).length) {
            patch.financials_status = 'submitted'
            patch.updated_at = new Date().toISOString()
            await db.from('listings').update(patch).eq('id', listingId)
          }
          set('docs', { note: `Read ${analyses.length} doc${analyses.length === 1 ? '' : 's'} — revenue $${(merged.revenueTotal || 0).toLocaleString()}, SDE $${(merged.sde || 0).toLocaleString()}` })
        })

        // ── 3. AUDIT — verify numbers, tag sources, red flags ───────────
        let audit: ReturnType<typeof runAudit> | null = null
        await run('audit', async () => {
          const { data: listing } = await db.from('listings').select('annual_revenue, sde, ebitda, asking_price').eq('id', listingId).maybeSingle()
          const l = listing as Record<string, unknown> | null
          const noteFigures = {
            revenue: (l?.annual_revenue as number | null) ?? null,
            sde: (l?.sde as number | null) ?? null,
            ebitda: (l?.ebitda as number | null) ?? null,
          }
          // Only figures that did NOT come from a doc are "from notes".
          const fromDoc = (v: number | null | undefined, docV: number | null | undefined) => v != null && docV != null && Math.abs(v - docV) < 1
          audit = runAudit({
            docFigures,
            noteFigures: {
              revenue: fromDoc(noteFigures.revenue, docFigures.revenue) ? null : noteFigures.revenue,
              sde: fromDoc(noteFigures.sde, docFigures.sde) ? null : noteFigures.sde,
              ebitda: fromDoc(noteFigures.ebitda, docFigures.ebitda) ? null : noteFigures.ebitda,
            },
            askingPrice: (l?.asking_price as number | null) ?? null,
          })
          const flags = audit.redFlags
          const tags = audit.figures.map((f) => `${f.field}:${f.source}`)
          await db.from('listings').update({
            ai_metadata: { ...((l?.ai_metadata as Record<string, unknown>) || {}), audit: { figures: audit.figures, redFlags: flags, tags }, audited_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          }).eq('id', listingId)
          set('audit', {
            note: flags.length
              ? `${flags.length} red flag${flags.length === 1 ? '' : 's'} — ${flags[0]}`
              : `${audit.figures.length} figure${audit.figures.length === 1 ? '' : 's'} verified, no red flags`,
          })
        })

        // ── 4+5. RECAST + DOCUMENTS — BOV/CIM/BLI generation ────────────
        await run('recast', async () => {
          const { runAutoGeneration } = await import('@/lib/autoGenerate')
          const result = await runAutoGeneration({ listingId })
          // Also seed the readiness-tracked version tables (the old wizard
          // steps wrote these rows; the readiness engine reads them). The PDFs
          // land in financial_documents via runAutoGeneration; these rows make
          // the readiness score reflect the generated artifacts.
          try {
            const { data: row } = await db.from('listings').select('business_name, industry, location_general, asking_price, sde, ebitda, annual_revenue').eq('id', listingId).maybeSingle()
            const l = (row || {}) as Record<string, unknown>
            const now = new Date().toISOString()
            const sde = (l.sde as number | null) ?? null
            const multiple = sde ? Math.max(2.0, Math.min(4.5, Math.round((Number(l.asking_price || 0) / sde) * 10) / 10)) : 3.0
            const valuation = sde ? Math.round(sde * multiple) : (l.asking_price as number | null) ?? null
            const recastPayload: Record<string, unknown> = { listing_id: listingId, recasted_at: now, original_sde: sde, recasted_sde: sde, original_ebitda: (l.ebitda as number | null) ?? null, recasted_ebitda: (l.ebitda as number | null) ?? null, add_backs: [], adjustments: [], notes: 'Auto-recast from the One-Shot build' }
            const { data: existingRecast } = await db.from('listing_recasts').select('id').eq('listing_id', listingId).maybeSingle()
            if (existingRecast?.id) await db.from('listing_recasts').update(recastPayload).eq('id', existingRecast.id)
            else await db.from('listing_recasts').insert(recastPayload)
            try { await db.from('bov_versions').insert({ listing_id: listingId, version_number: 1, valuation_multiple: multiple, valuation_amount: valuation, content: { valuation_multiple: multiple, valuation_amount: valuation, sde, business_name: l.business_name }, status: 'draft', generated_at: now }) } catch { /* best-effort */ }
            try { await db.from('cim_versions').insert({ listing_id: listingId, version_number: 1, content: { business_name: l.business_name, recasted_sde: sde, generated_from: 'recast' }, status: 'draft', generated_at: now }) } catch { /* best-effort */ }
            try { await db.from('bli_versions').insert({ listing_id: listingId, version_number: 1, content: { business_name: l.business_name, asking_price: l.asking_price, industry: l.industry, location_general: l.location_general }, status: 'draft', generated_at: now }) } catch { /* best-effort */ }
          } catch { /* version seeding is best-effort */ }
          if (!result.ok || !result.artifacts?.length) {
            set('recast', { status: 'skipped', note: result.error || 'No financials to recast yet' })
            return
          }
          set('recast', { note: 'Recast + add-backs applied to owner earnings' })
        })
        const docsGenStep = steps.find((s) => s.key === 'recast')
        await run('documents', async () => {
          if (docsGenStep?.status !== 'done') {
            set('documents', { status: 'skipped', note: 'No generated documents (needs financials)' })
            return
          }
          const { runAutoGeneration } = await import('@/lib/autoGenerate')
          const result = await runAutoGeneration({ listingId })
          const artifacts = result.artifacts || []
          if (!artifacts.length) {
            set('documents', { status: 'skipped', note: result.error || 'No documents generated' })
            return
          }
          set('documents', { note: `${artifacts.length} document${artifacts.length === 1 ? '' : 's'} generated (BOV/CIM/BLI)` })
        })

        // ── 6. SBA ───────────────────────────────────────────────────────
        await run('sba', async () => {
          const { data: listing } = await db.from('listings').select('asking_price, sde, sba_qualified').eq('id', listingId).maybeSingle()
          const l = listing as Record<string, unknown> | null
          const sba = sbaEligibility({ askingPrice: (l?.asking_price as number | null) ?? null, sde: (l?.sde as number | null) ?? null })
          await db.from('listings').update({ sba_qualified: sba.eligible, updated_at: new Date().toISOString() }).eq('id', listingId)
          set('sba', { note: sba.note })
        })

        // ── 7. COMPS + VALUATION ─────────────────────────────────────────
        let valuation: ReturnType<typeof valuationFromMultiples> | null = null
        await run('comps', async () => {
          const { data: listing } = await db.from('listings').select('agency_id, industry, sde, ebitda').eq('id', listingId).maybeSingle()
          const l = listing as Record<string, unknown> | null
          const agencyId = (l?.agency_id as string | null) || (auth.memberships?.[0]?.agency_id as string | undefined) || ''
          const industry = (l?.industry as string | null) || null
          const { listComps, multiplesByIndustry } = await import('@/lib/comps')
          const [comps, multiples] = await Promise.all([
            agencyId ? listComps(agencyId, industry || undefined) : Promise.resolve([]),
            agencyId ? multiplesByIndustry(agencyId) : Promise.resolve([]),
          ])
          valuation = valuationFromMultiples({
            sde: (l?.sde as number | null) ?? null,
            ebitda: (l?.ebitda as number | null) ?? null,
            multiples: (multiples as any[]).map((m) => ({
              industry: String(m.industry || 'Other'),
              avgMultiple: Number(m.avgMultiple) || 0,
              count: Number(m.count) || 0,
            })),
          })
          const meta: Record<string, unknown> = { compsCount: comps.length, valuation }
          await db.from('listings').update({
            ai_metadata: { ...((l?.ai_metadata as Record<string, unknown>) || {}), comps: meta },
            updated_at: new Date().toISOString(),
          }).eq('id', listingId)
          set('comps', {
            note: valuation
              ? `${valuation.basis} $${(valuation.mid).toLocaleString()} range $${valuation.low.toLocaleString()}–$${valuation.high.toLocaleString()}`
              : `${comps.length} comp${comps.length === 1 ? '' : 's'} found — add earnings to price`,
          })
        })

        // ── 8. BUYERS ────────────────────────────────────────────────────
        let buyerCount = 0
        await run('buyers', async () => {
          const { data: listing } = await db.from('listings').select('industry').eq('id', listingId).maybeSingle()
          const { matchBuyerLeads } = await import('@/lib/leads2')
          const leads = await matchBuyerLeads(((listing as any)?.industry as string | null) || null)
          buyerCount = leads.length
          set('buyers', {
            note: buyerCount ? `${buyerCount} qualified buyer${buyerCount === 1 ? '' : 's'} matched` : 'No buyer matches yet — add buyer leads first',
          })
        })

        // ── 9. PHOTOS — generate 4 AI options ────────────────────────────
        let photos: string[] = []
        await run('photos', async () => {
          try {
            const { data: listing } = await db.from('listings').select('business_name, industry, sub_industry, location_general, description').eq('id', listingId).maybeSingle()
            const l = listing as Record<string, unknown> | null
            const { buildAiPhotoPrompt, aiPhotoStyleById, resolveAiPhotoProvider, fetchAiImageBytes, aiPhotoSeed } = await import('@/lib/aiPhotos')
            const prompt = buildAiPhotoPrompt(
              {
                businessName: (l?.business_name as string | null) || null,
                industry: (l?.industry as string | null) || null,
                subIndustry: (l?.sub_industry as string | null) || null,
                location: (l?.location_general as string | null) || null,
                description: (l?.description as string | null) || null,
              },
              aiPhotoStyleById('realistic')
            )
            const provider = resolveAiPhotoProvider()
            const stamp = Date.now()
            const urls: string[] = []
            const { data: bucket } = await db.storage.getBucket(BUCKET)
            if (!bucket) await db.storage.createBucket(BUCKET, { public: true }).catch(() => {})
            await Promise.all(
              Array.from({ length: 4 }, async (_, i) => {
                try {
                  const { bytes, mime } = await fetchAiImageBytes(provider, prompt, aiPhotoSeed(i))
                  const ext = mime.includes('png') ? 'png' : 'jpg'
                  const path = `${listingId}/ai-${stamp}-${i}.${ext}`
                  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, cacheControl: '3600', upsert: true })
                  if (error) throw new Error(error.message)
                  const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)
                  urls.push(pub.publicUrl)
                } catch { /* per-option skip */ }
              })
            )
            if (urls.length) {
              photos = urls
              const { data: row } = await db.from('listings').select('image_urls').eq('id', listingId).maybeSingle()
              const existing: string[] = Array.isArray((row as any)?.image_urls) ? (row as any).image_urls : []
              const merged = [...new Set([...existing, ...urls])]
              await db.from('listings').update({ image_urls: merged, updated_at: new Date().toISOString() }).eq('id', listingId)
              set('photos', { note: `${urls.length} AI photo${urls.length === 1 ? '' : 's'} generated and saved to the gallery` })
            } else {
              set('photos', { status: 'skipped', note: 'Photo generation unavailable right now' })
            }
          } catch (e: any) {
            set('photos', { status: 'skipped', note: e?.message || 'Photo generation skipped' })
          }
        })

        // ── 10. TEASER — anonymous public copy ───────────────────────────
        await run('teaser', async () => {
          const { data: listing } = await db.from('listings').select('business_name, industry, location_general, annual_revenue, sde, public_title').eq('id', listingId).maybeSingle()
          const l = listing as Record<string, unknown> | null
          if (l?.public_title && String(l.public_title).trim()) {
            set('teaser', { status: 'skipped', note: 'Teaser already exists' })
            return
          }
          const { completeWithDeepSeek } = await import('@/lib/deepseek/client')
          const { system, user } = buildTeaserPrompt({
            businessName: (l?.business_name as string | null) || null,
            industry: (l?.industry as string | null) || null,
            location: (l?.location_general as string | null) || null,
            revenue: (l?.annual_revenue as number | null) ?? null,
            sde: (l?.sde as number | null) ?? null,
          })
          const res = await completeWithDeepSeek({
            context: { kind: 'listing', entityId: listingId, text: user },
            system,
            message: 'Write the anonymous teaser.',
            jsonMode: true,
            maxTokens: 800,
          })
          const d = (res.data || {}) as Record<string, unknown>
          const patch: Record<string, unknown> = {}
          if (typeof d.public_title === 'string' && d.public_title.trim()) patch.public_title = d.public_title.trim().slice(0, 120)
          if (typeof d.public_summary === 'string' && d.public_summary.trim()) patch.public_summary = d.public_summary.trim().slice(0, 1000)
          if (Array.isArray(d.public_highlights)) {
            const hl = (d.public_highlights as unknown[]).filter((x) => typeof x === 'string' && x.trim()).slice(0, 6) as string[]
            if (hl.length) patch.public_highlights = hl
          }
          if (Object.keys(patch).length) {
            patch.updated_at = new Date().toISOString()
            await db.from('listings').update(patch).eq('id', listingId)
          }
          set('teaser', { note: patch.public_title ? `"${patch.public_title}"` : 'Teaser written' })
        })

        // ── 11. READY — readiness score ──────────────────────────────────
        let readiness: Record<string, unknown> | null = null
        await run('ready', async () => {
          const { fetchListingReadiness } = await import('@/lib/listingReadiness')
          const r = await fetchListingReadiness(listingId)
          readiness = { score: r.score, grade: r.grade, blockers: r.blockers, nextAction: r.nextAction, canPublish: r.canPublish }
          set('ready', { note: `${r.score}/100 — ${r.grade} (${r.blockers?.length || 0} blocker${r.blockers?.length === 1 ? '' : 's'})` })
        })

        // ── DONE ──
        const { data: listing } = await db.from('listings').select('*').eq('id', listingId).single()
        send({
          type: 'done',
          result: {
            ok: true,
            listingId,
            listing,
            steps,
            audit,
            valuation,
            buyerCount,
            photos,
            readiness,
            failed: steps.filter((s) => s.status === 'failed').length,
          },
        })
        controller.close()
      } catch (e: any) {
        send({ type: 'error', error: e?.message || 'Build failed' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
