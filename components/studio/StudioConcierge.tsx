/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authHeaders } from '@/lib/authToken'
import type { IntakeDraft } from '@/lib/listingIntakeCore'
import { SELLER_FORM_SCHEMAS } from '@/lib/sellerFormSchemas'
import { computeValuation } from '@/lib/valuation'
import { formatMoneyInput, parseMoneyInput, moneyChange } from '@/lib/moneyInput'
import { supabase } from '@/lib/supabase/client'
import { uploadListingDocument, fetchListingDocuments } from '@/lib/workflow'
import { ADD_BACK_CATEGORIES, type AddBackCategory } from '@/lib/recast'

const fmtMoney = (n: number | null | undefined) =>
  n == null || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US')

// =============================================================================
// StudioConcierge — the conversation-first capture layer (AI Interviewer).
// -----------------------------------------------------------------------------
// "Tell me about the business — or paste call notes, a voicemail transcript,
// or a P&L summary. I'll build the record." The broker talks; the AI extracts
// a structured draft and the studio form fills itself LIVE. When the answer
// is thin, the concierge INTERVIEWS: it asks one follow-up at a time (reason
// for sale? owner hours? real estate? price?) until the key fields are
// covered or the broker says done — like a human broker, not a one-shot form.
// =============================================================================

const EXAMPLES = [
  'Laundromat in Philadelphia, ~$400k revenue, 3 years of books, owner works 25 hrs/week, asking $550k.',
  'HVAC company in Harrisburg — 2 vans, 4 techs, $1.2M revenue, $280k SDE, owner retiring.',
  'E-commerce brand, Shopify, $60k/mo, 40% margin, seller wants out in 6 months.',
]

const FIELD_LABELS: Record<string, string> = {
  business_name: 'Business name',
  industry: 'Industry',
  sub_industry: 'Sub-industry',
  location_general: 'Location',
  established_year: 'Year established',
  annual_revenue: 'Annual revenue',
  sde: 'SDE',
  ebitda: 'EBITDA',
  asking_price: 'Asking price',
  employees_full_time: 'FT employees',
  employees_part_time: 'PT employees',
  owner_hours_weekly: 'Owner hours/week',
  reason_for_sale: 'Reason for sale',
  growth_opportunities: 'Growth',
  competitive_advantages: 'Moat',
  customer_concentration: 'Customers',
  facilities_summary: 'Facilities',
  transition_support: 'Transition support',
  training_period_weeks: 'Training weeks',
  description: 'Description',
  public_title: 'Public title',
  public_summary: 'Public summary',
  public_highlights: 'Highlights',
}

// Interview question queue — asked one at a time when a key field is missing.
const INTERVIEW_QUESTIONS: Array<{ field: string; ask: string }> = [
  { field: 'industry', ask: 'What industry is the business in? (e.g. restaurant, HVAC, e-commerce)' },
  { field: 'location_general', ask: 'What general market area is it in? (region/state, never the exact address)' },
  { field: 'asking_price', ask: 'What asking price is the seller considering?' },
  { field: 'annual_revenue', ask: 'What is the annual revenue? (or SDE/EBITDA if you know it)' },
  { field: 'reason_for_sale', ask: "What's the seller's reason for selling?" },
  { field: 'established_year', ask: 'What year was the business established?' },
  { field: 'employees_full_time', ask: 'How many full-time employees does it have?' },
  { field: 'owner_hours_weekly', ask: 'How many hours per week does the owner work?' },
  { field: 'transition_support', ask: 'Is the seller willing to stay for a transition/training period?' },
  { field: 'growth_opportunities', ask: 'Any growth opportunities worth mentioning?' },
]

// Interview fields that accept a plain number answer (parsed directly, no AI round-trip).
const NUMERIC_QUESTION_FIELDS = new Set([
  'asking_price', 'annual_revenue', 'sde', 'ebitda', 'established_year',
  'employees_full_time', 'employees_part_time', 'owner_hours_weekly', 'training_period_weeks',
])

export default function StudioConcierge({
  onDraft,
  listingId,
  onListingCreated,
}: {
  /** Receives the extracted draft; the studio applies it to the live form. */
  onDraft: (draft: IntakeDraft) => void
  /** Optional listing id — enables financial upload straight to the deal record. */
  listingId?: string | null
  /** Called when the concierge auto-creates a draft listing for an upload. */
  onListingCreated?: (id: string) => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [pubBusy, setPubBusy] = useState(false)
  const [lastDraft, setLastDraft] = useState<IntakeDraft | null>(null)
  const [applied, setApplied] = useState(false)
  const [question, setQuestion] = useState<{ field: string; ask: string } | null>(null)
  const [answer, setAnswer] = useState('')
  const [qaCount, setQaCount] = useState(0)

  // ── Seller document checklist (gathered BEFORE the listing is taken) ──
  const docSchema = SELLER_FORM_SCHEMAS.doc_checklist
  const [docs, setDocs] = useState<Record<string, boolean>>({})
  const docTotal = docSchema.sections.reduce((n, s) => n + s.fields.length, 0)
  const docChecked = docSchema.sections.reduce((n, s) => n + s.fields.filter((f) => docs[f.key]).length, 0)
  const toggleDoc = (key: string) => setDocs((p) => ({ ...p, [key]: !p[key] }))

  // ── Financial upload → quick valuation ────────────────────────────────
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState<Array<{ id: string; name: string; url: string }>>([])
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null)
  const [sde, setSde] = useState('')
  const [revenue, setRevenue] = useState('')
  const [ebitda, setEbitda] = useState('')
  const [industry, setIndustry] = useState('')
  // Live-agent recast state
  const [agentStatus, setAgentStatus] = useState<string | null>(null)
  const [activeListingId, setActiveListingId] = useState<string | null>(listingId || null)
  const [baseSde, setBaseSde] = useState<number | null>(null)
  const [baseRevenue, setBaseRevenue] = useState<number | null>(null)
  const [baseEbitda, setBaseEbitda] = useState<number | null>(null)
  const [addbacks, setAddbacks] = useState<Array<{ category: AddBackCategory; label: string; checked: boolean; amount: string }>>(
    ADD_BACK_CATEGORIES.map((c) => ({ category: c.id, label: c.label, checked: c.defaultChecked, amount: '' })),
  )
  const [recastResult, setRecastResult] = useState<{ sde: number; ebitda: number | null; revenue: number | null; totalAddBacks: number } | null>(null)
  const [savedDoc, setSavedDoc] = useState<{ url: string; fileName: string } | null>(null)
  const [savingRecast, setSavingRecast] = useState(false)
  const estimate = computeValuation({
    business_name: null,
    sde: parseMoneyInput(sde),
    annual_revenue: parseMoneyInput(revenue),
    ebitda: parseMoneyInput(ebitda),
    industry: industry || null,
    asking_price: null,
  })

  // Load financial docs already attached to this deal record (works in
  // Capture too once a draft deal is auto-created on first upload).
  useEffect(() => {
    const dealId = activeListingId || listingId
    if (!dealId) return
    ;(async () => {
      try {
        const rows = await fetchListingDocuments(dealId)
        const financials = (rows || []).filter((d) =>
          /financial|tax_return|bank_statement/i.test(String(d.document_type || d.category || '')),
        )
        setUploaded(financials.map((d) => ({ id: String(d.id || ''), name: String(d.file_name || 'document'), url: String(d.file_url || '') })))
      } catch {
        /* non-fatal */
      }
    })()
  }, [activeListingId, listingId])

  const uploadFinancial = async (f: File) => {
    // No deal record yet (fresh Capture) → auto-create a draft listing so the
    // upload has somewhere to attach. Zero friction, no "save first" gate.
    let targetListingId = listingId || null
    if (!targetListingId) {
      try {
        const { createListing } = await import('@/lib/listings')
        const created = await createListing({ business_name: 'Untitled deal', status: 'draft' })
        targetListingId = created.id
        setActiveListingId(created.id)
        onListingCreated?.(created.id)
      } catch (e: any) {
        toast(e.message || 'Could not create the deal record for this upload', 'error')
        return
      }
    }
    setUploading(true)
    try {
      const path = `listing-docs/${targetListingId}/financials/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, f)
      if (upErr) { toast('Upload failed — check the documents bucket', 'error'); return }
      const url = supabase.storage.from('documents').getPublicUrl(path).data.publicUrl
      const row = await uploadListingDocument(targetListingId, { document_type: 'financial_proof', file_name: f.name, file_url: url, party_type: 'seller' })
      setUploaded((p) => [{ id: String(row?.id || ''), name: f.name, url }, ...p])
      toast(`Financial doc uploaded — ${f.name}`, 'success')

      // ── Live agent: read the doc and auto-fill the quick valuation ──
      setAgentStatus('📖 Reading your financials…')
      try {
        const fd = new FormData()
        fd.append('file', f)
        if (targetListingId) fd.append('listingId', targetListingId)
        const impRes = await fetch('/api/listings/financial-import', {
          method: 'POST',
          headers: authHeaders(), // no Content-Type — FormData sets it
          body: fd,
        })
        const imp = await impRes.json().catch(() => ({}))
        const fin = imp?.financials || null
        if (imp?.ok && fin) {
          const rev = fin.revenueTotal ?? fin.latestYearRevenue ?? null
          if (fin.sde != null) { setSde(String(fin.sde)); setBaseSde(Number(fin.sde)) }
          if (rev != null) { setRevenue(String(rev)); setBaseRevenue(Number(rev)) }
          if (fin.ebitda != null) { setEbitda(String(fin.ebitda)); setBaseEbitda(Number(fin.ebitda)) }
          const parts = [
            fin.sde != null ? `SDE ${fmtMoney(Number(fin.sde))}` : '',
            rev != null ? `Revenue ${fmtMoney(Number(rev))}` : '',
            fin.ebitda != null ? `EBITDA ${fmtMoney(Number(fin.ebitda))}` : '',
          ].filter(Boolean)
          setAgentStatus(`✅ Read ${f.name} — ${parts.join(' · ') || 'no numbers found'}. Review add-backs below, then Save recast.`)
        } else {
          setAgentStatus('⚠️ Uploaded, but I could not read numbers from this file. Enter them manually below, or try a cleaner P&L/CSV.')
        }
      } catch {
        setAgentStatus('⚠️ Uploaded — auto-read failed. Enter numbers manually below.')
      }
    } catch (e: any) {
      toast(e.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  /** Recast: base (extracted/manual) + checked add-backs → accurate SDE/EBITDA. */
  const applyRecast = () => {
    const total = addbacks.filter((a) => a.checked).reduce((sum, a) => sum + (parseMoneyInput(a.amount) || 0), 0)
    const sdeBase = parseMoneyInput(sde)
    const ebitdaBase = parseMoneyInput(ebitda)
    setRecastResult({
      sde: (sdeBase ?? 0) + total,
      ebitda: ebitdaBase != null ? ebitdaBase + total : null,
      revenue: parseMoneyInput(revenue),
      totalAddBacks: total,
    })
    // Push the recast numbers into the quick valuation (deal record side).
    setSde(String((sdeBase ?? 0) + total))
    if (ebitdaBase != null) setEbitda(String(ebitdaBase + total))
    setAgentStatus(`🔁 Recast done — +${fmtMoney(total)} add-backs applied. SDE now ${fmtMoney((sdeBase ?? 0) + total)}. Save the recast doc below.`)
  }

  /** Save the recast PDF to the deal's financial folder + record it. */
  const saveRecast = async () => {
    if (!recastResult) { toast('Apply add-backs first, then save', 'error'); return }
    const dealId = activeListingId || listingId || null
    if (!dealId) { toast('Save the deal record first (or upload once so a draft deal is created)', 'error'); return }
    setSavingRecast(true)
    try {
      const res = await fetch('/api/listings/recast-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          listingId: dealId,
          businessName: 'Untitled deal',
          year: new Date().getFullYear(),
          revenue: recastResult.revenue,
          sde: recastResult.sde,
          ebitda: recastResult.ebitda,
          baseSde: baseSde ?? parseMoneyInput(sde),
          baseEbitda: baseEbitda ?? parseMoneyInput(ebitda),
          addBacks: addbacks.filter((a) => a.checked && parseMoneyInput(a.amount)).map((a) => ({ label: a.label, amount: parseMoneyInput(a.amount) })),
          totalAddBacks: recastResult.totalAddBacks,
        }),
      })
      const j = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Save failed')
      setSavedDoc({ url: j.url, fileName: j.fileName })
      setAgentStatus(`✅ Recast saved to the financial folder (${j.fileName}) — ${fmtMoney(recastResult.sde)} SDE.`)
      toast('Recast document saved ✓', 'success')
    } catch (e: any) {
      toast(e.message || 'Save failed', 'error')
    } finally {
      setSavingRecast(false)
    }
  }

  const deleteFinancial = async (doc: { id: string; name: string; url: string }) => {
    const dealId = activeListingId || listingId
    if (!dealId || !doc.id) { toast('Nothing to delete', 'error'); return }
    if (!confirm(`Delete "${doc.name}"? This removes it from the deal record and storage.`)) return
    setUploading(true)
    try {
      const res = await fetch('/api/listings/documents/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: dealId, docId: doc.id, fileUrl: doc.url }),
      })
      const j = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Delete failed')
      setUploaded((p) => p.filter((x) => x.id !== doc.id))
      toast(`Deleted — ${doc.name}`, 'success')
    } catch (e: any) {
      toast(e.message || 'Delete failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const hasField = (draft: IntakeDraft | null, field: string) => {
    const v = draft?.[field]
    return v !== undefined && v !== null && v !== ''
  }

  /** Pick the next missing key field from the interview queue. */
  const nextQuestion = (draft: IntakeDraft): { field: string; ask: string } | null => {
    for (const q of INTERVIEW_QUESTIONS) {
      if (!hasField(draft, q.field)) return q
    }
    return null
  }

  const extract = async (raw?: string) => {
    const input = (raw ?? text).trim()
    if (!input) { toast('Tell me about the business first', 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/listings/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ mode: 'full', context: input }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || j.detail || 'Extraction failed — add more detail (name, revenue, location, industry) and tap Build my listing again')
      const draft = (j.draft || {}) as IntakeDraft
      if (Object.keys(draft).length === 0) {
        toast('Could not extract fields — try more detail (name, revenue, location, industry)', 'error')
        return
      }
      setLastDraft(draft)
      setApplied(false)
      toast(`AI extracted ${j.coverage?.filled || Object.keys(draft).length} fields`, 'success')

      // AI Interviewer: if key fields are still missing, ask one at a time.
      const next = nextQuestion(draft)
      if (next && qaCount < 6) {
        setQuestion(next)
        setAnswer('')
      } else {
        setQuestion(null)
      }
    } catch (e: any) {
      const msg = e.message || 'Extraction failed'
      // If the AI service is down/out of credits, guide the broker to the manual form.
      if (/unavailable|busy right now|out of credits|not configured|service hiccup/i.test(msg)) {
        toast('AI intake is down right now — no problem, you can still fill the form below manually and the listing saves fine ✍️', 'info')
      } else {
        toast(msg, 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  /** Answer the current interview question → append to context → re-extract. */
  const answerQuestion = async () => {
    const a = answer.trim()
    if (!a) { toast('Type an answer first', 'error'); return }
    const q = question
    if (!q) return

    // Direct numeric handling — no AI round-trip needed for numbers.
    // (Previously a bare answer like "3500000" went back through the AI
    // extractor, which often failed to parse it, so the question re-asked.)
    if (NUMERIC_QUESTION_FIELDS.has(q.field)) {
      const n = parseMoneyInput(a)
      if (n === null) {
        toast('Enter the amount in numbers — e.g. 3,500,000', 'error')
        return
      }
      const patch = { [q.field]: n } as IntakeDraft
      const merged = { ...(lastDraft || {}), ...patch }
      setLastDraft(merged)
      setApplied(false)
      onDraft(merged) // fill the form immediately
      setAnswer('')
      const nextCount = qaCount + 1
      setQaCount(nextCount)
      const next = nextQuestion(merged)
      if (next && nextCount < 6) setQuestion(next)
      else setQuestion(null)
      toast(`Got it — ${q.field.replace(/_/g, ' ')} saved ✓`, 'success')
      return
    }

    // Text answers: append to context and re-extract.
    const nextText = `${text.trim()}\n${q.ask} — ${a}`
    setText(nextText)
    setQaCount((c) => c + 1)
    await extract(nextText)
  }

  /** Draft the anonymized public positioning (title/summary/highlights). */
  const draftPublic = async () => {
    const input = text.trim()
    if (!input) { toast('Paste or describe the business first', 'error'); return }
    setPubBusy(true)
    try {
      const res = await fetch('/api/listings/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ mode: 'public', context: input }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Public draft failed')
      const draft = (j.draft || {}) as IntakeDraft
      if (!draft.public_title && !draft.public_summary && !draft.public_highlights) {
        toast('Could not draft public copy — add industry, location, and a description', 'error')
        return
      }
      setLastDraft(draft)
      setApplied(false)
      toast('Public positioning drafted — anonymous, seller-approved copy ready', 'success')
    } catch (e: any) {
      toast(e.message || 'Public draft failed', 'error')
    } finally {
      setPubBusy(false)
    }
  }

  const apply = () => {
    if (!lastDraft) return
    onDraft(lastDraft)
    setApplied(true)
    toast('Draft applied to the record — the form filled itself ✨', 'success')
  }

  const draftFields = lastDraft ? Object.entries(lastDraft).filter(([, v]) => v !== null && v !== '' && v !== false) : []

  return (
    <div style={{ background: 'linear-gradient(135deg,#0f1023,#1a1a2e 55%,#0f3460)', color: '#fff', borderRadius: 16, padding: 22, marginBottom: 18, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 60% at 85% 10%, rgba(201,168,76,0.16), transparent 60%)' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 26 }}>✨</span>
          <div>
            <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 800 }}>AI Concierge</div>
            <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'Georgia, serif' }}>Tell me about the business — I&apos;ll build the record</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6, maxWidth: 640, margin: '0 0 14px' }}>
          Paste what you know — call notes, a voicemail transcript, a P&L summary, or plain sentences. I&apos;ll ask for anything I&apos;m missing, one question at a time.
        </p>

        {/* Seller document checklist — gathered before the listing is taken */}
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>📋 Seller document checklist</div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: docChecked === docTotal ? '#4ade80' : '#f5d97a' }}>
              {docChecked}/{docTotal} collected
            </span>
          </div>
          {docSchema.sections.map((section) => (
            <div key={section.title} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 5 }}>{section.title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 4 }}>
                {section.fields.map((f) => (
                  <label key={f.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.82)', cursor: 'pointer', lineHeight: 1.35 }}>
                    <input type="checkbox" checked={!!docs[f.key]} onChange={() => toggleDoc(f.key)} style={{ marginTop: 2, accentColor: '#c9a84c' }} />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Financial upload + quick valuation — "your business is worth this much" */}
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff', marginBottom: 8 }}>💵 Financials → quick valuation</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ padding: '9px 16px', borderRadius: 8, background: 'rgba(201,168,76,0.16)', border: '1px solid rgba(201,168,76,0.5)', color: '#f5d97a', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
              {uploading ? '⏳ Uploading…' : '📤 Upload financials (P&L, tax returns)'}
              <input type="file" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadFinancial(f); e.target.value = '' }} />
            </label>
            {!listingId && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Uploads attach to a new draft deal automatically.</span>}
          </div>

          {/* Live-agent status line */}
          {agentStatus && (
            <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(125,211,252,0.1)', border: '1px solid rgba(125,211,252,0.3)', fontSize: 12, color: '#bae6fd', fontWeight: 600 }}>
              {agentStatus}
            </div>
          )}

          {uploaded.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {uploaded.map((u) => (
                <div key={u.id || u.url} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 13 }}>📎</span>
                  <span style={{ flex: 1, fontSize: 12, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                  <a href={u.url} download={u.name} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#6ee7b7', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>⬇ Download</a>
                  <button onClick={() => setPreview({ name: u.name, url: u.url })} style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>👁 Preview</button>
                  <button onClick={() => deleteFinancial(u)} disabled={uploading} style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#fca5a5', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>✕ Delete</button>
                </div>
              ))}
            </div>
          )}
          {uploaded.length === 0 && listingId && (
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>No financials attached yet — upload P&L or tax returns above.</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <input value={formatMoneyInput(sde)} onChange={moneyChange(setSde)} placeholder="SDE" style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }} inputMode="numeric" />
            <input value={formatMoneyInput(revenue)} onChange={moneyChange(setRevenue)} placeholder="Annual revenue" style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }} inputMode="numeric" />
            <input value={formatMoneyInput(ebitda)} onChange={moneyChange(setEbitda)} placeholder="EBITDA (opt.)" style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }} inputMode="numeric" />
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry (opt.)" style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }} />
          </div>

          {/* Add-back checklist (one-time expenses → accurate SDE/EBITDA) */}
          {(sde || revenue || baseSde != null) && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#f5d97a', marginBottom: 4 }}>🔁 One-time expenses & add-backs</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Tick what applies and enter the amounts — these raise SDE/EBITDA to the true broker number.</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6 }}>
                {addbacks.map((ab) => (
                  <label key={ab.category} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(255,255,255,0.85)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={ab.checked} onChange={() => setAddbacks((p) => p.map((x) => x.category === ab.category ? { ...x, checked: !x.checked } : x))} style={{ accentColor: '#c9a84c' }} />
                    <span style={{ flex: 1 }}>{ab.label}</span>
                    <input value={formatMoneyInput(ab.amount)} onChange={moneyChange((v) => setAddbacks((p) => p.map((x) => x.category === ab.category ? { ...x, amount: v } : x)))} placeholder="0" style={{ width: 84, padding: '4px 6px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 11.5 }} inputMode="numeric" />
                  </label>
                ))}
              </div>
              <button onClick={applyRecast} style={{ marginTop: 8, padding: '7px 14px', borderRadius: 8, background: '#c9a84c', color: '#0f1023', border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                🔁 Apply add-backs & recast
              </button>
            </div>
          )}

          {/* Recast result + save to financial folder */}
          {recastResult && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.45)' }}>
              <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>Recast result (accurate numbers)</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#f5d97a', fontFamily: 'Georgia, serif', marginTop: 2 }}>
                SDE {fmtMoney(recastResult.sde)}{recastResult.ebitda != null ? ` · EBITDA ${fmtMoney(recastResult.ebitda)}` : ''}
              </div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>+{fmtMoney(recastResult.totalAddBacks)} add-backs applied</div>
              {savedDoc ? (
                <a href={savedDoc.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, padding: '8px 14px', borderRadius: 8, background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 12, textDecoration: 'none' }}>
                  📄 Recast saved — open {savedDoc.fileName} ↗
                </a>
              ) : (
                <button onClick={saveRecast} disabled={savingRecast} style={{ marginTop: 8, padding: '8px 14px', borderRadius: 8, background: savingRecast ? '#999' : '#16a34a', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12, cursor: savingRecast ? 'wait' : 'pointer' }}>
                  {savingRecast ? 'Saving…' : '💾 Save recast to financial folder'}
                </button>
              )}
            </div>
          )}

          {estimate ? (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.45)' }}>
              <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>Estimated value — "your business is worth"</div>
              <div style={{ fontSize: 21, fontWeight: 800, color: '#f5d97a', fontFamily: 'Georgia, serif' }}>{fmtMoney(estimate.estimate_min)} – {fmtMoney(estimate.estimate_max)}</div>
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>Enter SDE or revenue for an instant range to share with the seller.</div>
          )}
        </div>

        {/* Interview Q&A — one question at a time, like a human broker */}
        {question ? (
          <div style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(201,168,76,0.5)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f5d97a', marginBottom: 8 }}>🧑‍💼 {question.ask}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && answerQuestion()}
                placeholder="Type your answer…"
                autoFocus
                style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 13.5, fontFamily: 'inherit' }}
              />
              <button
                onClick={answerQuestion}
                disabled={busy || !answer.trim()}
                style={{ padding: '10px 20px', borderRadius: 8, background: '#c9a84c', color: '#0f1023', border: 'none', fontWeight: 800, fontSize: 13, cursor: busy || !answer.trim() ? 'not-allowed' : 'pointer', opacity: busy || !answer.trim() ? 0.55 : 1 }}
              >
                {busy ? '…' : 'Answer'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
              {qaCount}/6 follow-ups · answer or skip to apply what we have
            </div>
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLES[0]}
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
              <button
                onClick={() => extract()}
                disabled={busy || !text.trim()}
                style={{ padding: '11px 22px', borderRadius: 9, background: '#c9a84c', color: '#0f1023', border: 'none', fontWeight: 800, fontSize: 13.5, cursor: busy || !text.trim() ? 'not-allowed' : 'pointer', opacity: busy || !text.trim() ? 0.55 : 1 }}
              >
                {busy ? '✨ Extracting…' : '✨ Build my listing'}
              </button>
              <button
                onClick={draftPublic}
                disabled={pubBusy || !text.trim()}
                style={{ padding: '11px 22px', borderRadius: 9, background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.35)', fontWeight: 800, fontSize: 13.5, cursor: pubBusy || !text.trim() ? 'not-allowed' : 'pointer', opacity: pubBusy || !text.trim() ? 0.55 : 1 }}
              >
                {pubBusy ? '📣 Drafting…' : '📣 Draft public positioning'}
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>Public copy stays anonymous — never the legal name, address, or owner.</span>
            </div>
          </>
        )}

        {preview && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,11,23,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 24 }} onClick={() => setPreview(null)}>
            <div style={{ background: '#fff', borderRadius: 12, maxWidth: 860, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 18 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>👁 {preview.name}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={preview.url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: '#1d4ed8' }}>Open in new tab ↗</a>
                  <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
                </div>
              </div>
              {preview.url ? (
                /\.(png|jpe?g|gif|webp|svg)$/i.test(preview.url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt={preview.name} style={{ width: '100%', borderRadius: 8 }} />
                ) : (
                  <iframe src={preview.url} title={preview.name} style={{ width: '100%', height: '70vh', border: '1px solid #ece8dc', borderRadius: 8 }} />
                )
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>No preview available — use “Open in new tab”.</div>
              )}
            </div>
          </div>
        )}

        {/* Extracted-field preview chips */}
        {lastDraft && draftFields.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {draftFields.slice(0, 14).map(([k, v]) => (
              <span key={k} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 99, background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.4)', color: '#f5d97a', fontWeight: 600 }}>
                {FIELD_LABELS[k] || k}: <strong>{String(v).slice(0, 28)}</strong>
              </span>
            ))}
            {draftFields.length > 14 && <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', alignSelf: 'center' }}>+{draftFields.length - 14} more…</span>}
            {lastDraft && !applied && (
              <button
                onClick={apply}
                style={{ fontSize: 12, padding: '4px 14px', borderRadius: 99, background: '#22c55e', color: '#052e16', border: 'none', fontWeight: 800, cursor: 'pointer' }}
              >
                ✓ Apply {draftFields.length} fields
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
