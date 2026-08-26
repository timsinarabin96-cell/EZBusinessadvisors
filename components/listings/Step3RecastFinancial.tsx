/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { StepShell, stepField, stepLabel, stepBtn } from '@/components/listings/StepShell'
import { saveRecast, fetchRecast, completeStep, fetchFinancials } from '@/lib/workflow'
import MoneyInput from '@/components/ui/MoneyInput'

// ---------------------------------------------------------------------------
// Step 3 — Recast Financials: normalize owner financials with add-backs.
// ---------------------------------------------------------------------------

const EMPTY_BACK = { id: Date.now(), label: '', amount: '' }

export default function Step3RecastFinancial({ listingId, onNext }: { listingId: string; onNext: () => void }) {
  const [originalSde, setOriginalSde] = useState('')
  const [originalEbitda, setOriginalEbitda] = useState('')
  const [recastedSde, setRecastedSde] = useState('')
  const [recastedEbitda, setRecastedEbitda] = useState('')
  const [addBacks, setAddBacks] = useState<{ id: number; label: string; amount: string }[]>([{ ...EMPTY_BACK, id: Date.now() + 1 }])
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState('')

  const loadSuggestions = async () => {
    setSuggesting(true)
    setSuggestError('')
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setSuggestError('Not signed in'); return }
      const res = await fetch(`/api/listings/recast-suggest?listingId=${encodeURIComponent(listingId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Could not generate suggestions')
      const suggestions = j.suggestions || []
      if (!suggestions.length) { setSuggestError('No add-back suggestions for this profile — add them manually.'); return }
      // Merge into existing add-back rows (replace empties, append the rest).
      const rows = [...addBacks]
      let i = 0
      for (const s of suggestions) {
        if (i < rows.length) rows[i] = { id: rows[i].id, label: s.label, amount: String(s.amount) }
        else rows.push({ id: Date.now() + i, label: s.label, amount: String(s.amount) })
        i++
      }
      setAddBacks(rows)
      if (suggestions.length) {
        const total = suggestions.reduce((s2: number, x: any) => s2 + (Number(x.amount) || 0), 0)
        setNotes((n) => (n ? n : `AI add-back suggestions applied (${suggestions.length} items, +$${total.toLocaleString()}) — review each before completing.`))
      }
    } catch (e: any) {
      setSuggestError(e.message || 'Could not generate suggestions')
    } finally {
      setSuggesting(false)
    }
  }

  useEffect(() => {
    (async () => {
      const [rec, fin] = await Promise.all([fetchRecast(listingId), fetchFinancials(listingId)])
      if (rec) {
        setOriginalSde(rec.original_sde ?? ''); setOriginalEbitda(rec.original_ebitda ?? '')
        setRecastedSde(rec.recasted_sde ?? ''); setRecastedEbitda(rec.recasted_ebitda ?? '')
        const backs = (rec.add_backs || []).map((b: any, i: number) => ({ id: i, label: b.label || '', amount: b.amount ?? '' }))
        setAddBacks(backs.length ? backs : [{ ...EMPTY_BACK, id: 1 }])
        setNotes(rec.notes || '')
      } else if (fin) {
        setOriginalSde(fin.sde?.amount ?? ''); setOriginalEbitda(fin.ebitda?.amount ?? '')
      }
    })()
  }, [listingId])

  const totalAddBacks = addBacks.reduce((s, b) => s + (Number(String(b.amount).replace(/[$,]/g, '')) || 0), 0)
  const sdeVal = (Number(String(originalSde).replace(/[$,]/g, '')) || 0) + totalAddBacks

  const save = async () => {
    setBusy(true)
    await saveRecast(listingId, {
      original_sde: Number(String(originalSde).replace(/[$,]/g, '')) || null, recasted_sde: sdeVal,
      original_ebitda: Number(String(originalEbitda).replace(/[$,]/g, '')) || null, recasted_ebitda: Number(String(recastedEbitda).replace(/[$,]/g, '')) || null,
      add_backs: addBacks.map((b) => ({ label: b.label, amount: Number(String(b.amount).replace(/[$,]/g, '')) || 0 })),
      notes,
    })
    await completeStep(listingId, 3)
    setBusy(false)
    onNext()
  }

  const update: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }
  const inputStyle: React.CSSProperties = { ...stepField, padding: '10px 12px' }

  return (
    <StepShell step={3} title="Recast Financials" description="Normalize owner financials by adding back discretionary expenses to arrive at a sustainable SDE/EBITDA."
      status="draft" onNext={save} nextDisabled={!sdeVal} nextLabel={busy ? 'Saving…' : 'Step 3 complete →'}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <label style={stepLabel}>Original SDE<MoneyInput value={originalSde} onChange={(v) => setOriginalSde(v)} /></label>
        <label style={stepLabel}>Original EBITDA<MoneyInput value={originalEbitda} onChange={(v) => setOriginalEbitda(v)} /></label>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          onClick={loadSuggestions}
          disabled={suggesting}
          style={{ ...stepBtn(true), background: suggesting ? '#aaa' : '#1a1a2e', color: '#c9a84c' }}
        >
          {suggesting ? '✨ Analyzing…' : '✨ AI Suggest add-backs'}
        </button>
        {suggestError && <span style={{ fontSize: 12.5, color: '#b91c1c' }}>{suggestError}</span>}
      </div>

      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 10 }}>Add-backs</div>
      {addBacks.map((b) => (
        <div key={b.id} style={update}>
          <input value={b.label} onChange={(e) => setAddBacks(addBacks.map((x) => x.id === b.id ? { ...x, label: e.target.value } : x))} placeholder="Add-back description (e.g. owner salary, personal vehicle)" style={{ ...inputStyle, flex: 1 }} />
          <div style={{ width: 150 }}><MoneyInput value={b.amount} onChange={(v) => setAddBacks(addBacks.map((x) => x.id === b.id ? { ...x, amount: v } : x))} /></div>
          <button onClick={() => setAddBacks(addBacks.filter((x) => x.id !== b.id))} style={stepBtn(false)}>✕</button>
        </div>
      ))}
      <button onClick={() => setAddBacks([...addBacks, { ...EMPTY_BACK, id: Date.now() }])} style={{ ...stepBtn(false), marginBottom: 16 }}>+ Add add-back</button>

      <div style={{ padding: '14px 18px', background: 'var(--paper)', borderRadius: 8, border: '1px solid var(--line)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>Recasted SDE (auto-calculated)</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>${sdeVal.toLocaleString()}</span>
        </div>
      </div>

      <label style={stepLabel}>Recasted EBITDA
        <MoneyInput value={recastedEbitda} onChange={(v) => setRecastedEbitda(v)} />
      </label>
      <label style={stepLabel}>Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Recast assumptions and rationale…" style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
    </StepShell>
  )
}
