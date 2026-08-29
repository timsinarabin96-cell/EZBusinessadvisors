/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authHeaders } from '@/lib/authToken'
import type { IntakeDraft } from '@/lib/listingIntakeCore'
import { SELLER_FORM_SCHEMAS } from '@/lib/sellerFormSchemas'
import { computeValuation } from '@/lib/valuation'
import { supabase } from '@/lib/supabase/client'
import { uploadListingDocument } from '@/lib/workflow'

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

export default function StudioConcierge({
  onDraft,
  listingId,
}: {
  /** Receives the extracted draft; the studio applies it to the live form. */
  onDraft: (draft: IntakeDraft) => void
  /** Optional listing id — enables financial upload straight to the deal record. */
  listingId?: string | null
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
  const [uploaded, setUploaded] = useState<Array<{ name: string; url: string }>>([])
  const [sde, setSde] = useState('')
  const [revenue, setRevenue] = useState('')
  const [ebitda, setEbitda] = useState('')
  const [industry, setIndustry] = useState('')
  const estimate = computeValuation({
    business_name: null,
    sde: sde ? Number(sde) : null,
    annual_revenue: revenue ? Number(revenue) : null,
    ebitda: ebitda ? Number(ebitda) : null,
    industry: industry || null,
    asking_price: null,
  })

  const uploadFinancial = async (f: File) => {
    if (!listingId) { toast('Save the deal record first, then upload financials here.', 'info'); return }
    setUploading(true)
    try {
      const path = `listing-docs/${listingId}/financials/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, f)
      if (upErr) { toast('Upload failed — check the documents bucket', 'error'); return }
      const url = supabase.storage.from('documents').getPublicUrl(path).data.publicUrl
      await uploadListingDocument(listingId, { document_type: 'financial_proof', file_name: f.name, file_url: url, party_type: 'seller' })
      setUploaded((p) => [{ name: f.name, url }, ...p])
      toast(`Financial doc uploaded — ${f.name}`, 'success')
    } catch (e: any) {
      toast(e.message || 'Upload failed', 'error')
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
              <input type="file" style={{ display: 'none' }} accept=".pdf,.xls,.xlsx,.csv,.jpg,.png" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadFinancial(f); e.target.value = '' }} />
            </label>
            {!listingId && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Save the deal record first to attach uploads.</span>}
          </div>
          {uploaded.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {uploaded.map((u) => (
                <a key={u.url} href={u.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#7dd3fc', fontWeight: 600 }}>📎 {u.name} ↗</a>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            <input value={sde} onChange={(e) => setSde(e.target.value)} placeholder="SDE" style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }} inputMode="numeric" />
            <input value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="Annual revenue" style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }} inputMode="numeric" />
            <input value={ebitda} onChange={(e) => setEbitda(e.target.value)} placeholder="EBITDA (opt.)" style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }} inputMode="numeric" />
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry (opt.)" style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }} />
          </div>
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
