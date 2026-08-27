/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { IntakeDraft } from '@/lib/listingIntakeCore'

// =============================================================================
// StudioConcierge — the conversation-first capture layer.
// -----------------------------------------------------------------------------
// "Tell me about the business — or paste call notes, a voicemail transcript,
// or a P&L summary. I'll build the record." The broker talks; the AI extracts
// a structured draft and the studio form fills itself LIVE. The broker only
// touches what the AI missed.
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

export default function StudioConcierge({
  onDraft,
}: {
  /** Receives the extracted draft; the studio applies it to the live form. */
  onDraft: (draft: IntakeDraft) => void
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastDraft, setLastDraft] = useState<IntakeDraft | null>(null)
  const [applied, setApplied] = useState(false)

  const extract = async (raw?: string) => {
    const input = (raw ?? text).trim()
    if (!input) { toast('Tell me about the business first', 'error'); return }
    setBusy(true)
    setApplied(false)
    try {
      const res = await fetch('/api/listings/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'full', context: input }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Extraction failed')
      const draft = (j.draft || {}) as IntakeDraft
      if (Object.keys(draft).length === 0) {
        toast('Could not extract fields — try more detail (name, revenue, location, industry)', 'error')
        return
      }
      setLastDraft(draft)
      toast(`AI extracted ${j.coverage?.filled || Object.keys(draft).length} fields — review, then apply`, 'success')
    } catch (e: any) {
      toast(e.message || 'Extraction failed', 'error')
    } finally {
      setBusy(false)
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
          Paste what you know — call notes, a voicemail transcript, a P&L summary, or plain sentences. The AI fills the form live; you only touch what it missed.
        </p>

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
          {lastDraft && !applied && (
            <button
              onClick={apply}
              style={{ padding: '11px 22px', borderRadius: 9, background: '#22c55e', color: '#052e16', border: 'none', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}
            >
              ✓ Apply {draftFields.length} fields to the form
            </button>
          )}
          {applied && (
            <span style={{ fontSize: 13, color: '#86efac', fontWeight: 700 }}>✓ Applied — the record is filling itself</span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>Try: {EXAMPLES[1].slice(0, 60)}…</span>
        </div>

        {/* Extracted-field preview chips */}
        {lastDraft && draftFields.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {draftFields.slice(0, 14).map(([k, v]) => (
              <span key={k} style={{ fontSize: 11.5, padding: '4px 10px', borderRadius: 99, background: 'rgba(201,168,76,0.14)', border: '1px solid rgba(201,168,76,0.4)', color: '#f5d97a', fontWeight: 600 }}>
                {FIELD_LABELS[k] || k}: <strong>{String(v).slice(0, 28)}</strong>
              </span>
            ))}
            {draftFields.length > 14 && <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', alignSelf: 'center' }}>+{draftFields.length - 14} more…</span>}
          </div>
        )}
      </div>
    </div>
  )
}
