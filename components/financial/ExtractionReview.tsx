/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// ExtractionReview — broker review/override of AI-extracted financials.
// -----------------------------------------------------------------------------
// Lists every extraction for a listing with its confidence score and the
// source document. Broker can APPROVE (locks the AI numbers as trusted) or
// OVERRIDE (corrects them — the override becomes the source of truth that
// feeds valuation/BOV/CIM/recast). Every action is audit-logged on the row.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { useToast } from '@/components/ui/Toast'
import { LoadingState } from '@/components/ui'
import { formatMoneyInput, moneyChange } from '@/lib/moneyInput'

interface ExtractionRow {
  id: string
  fiscal_year: number | null
  doc_type: string
  confidence: number
  extracted: Record<string, unknown> | null
  broker_override: Record<string, unknown> | null
  review_state: 'pending' | 'approved' | 'overridden'
  reviewed_at: string | null
  financial_documents: { file_name: string; fiscal_year: number | null; category: string } | null
}

const money = (n: unknown) => (n == null || !Number.isFinite(Number(n)) ? '—' : '$' + Math.round(Number(n)).toLocaleString())

const STATE_COLOR: Record<string, string> = {
  pending: '#b45309',
  approved: '#1e7e34',
  overridden: '#1d4ed8',
}

const STATE_LABEL: Record<string, string> = {
  pending: '⏳ Pending review',
  approved: '✅ Approved',
  overridden: '✏️ Broker override',
}

export default function ExtractionReview({ listingId }: { listingId: string }) {
  const toast = useToast()
  const [rows, setRows] = useState<ExtractionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ revenueTotal: '', expenseTotal: '', sde: '', ebitda: '', assets: '', liabilities: '', notes: '' })

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/financial/extractions?listingId=${listingId}`)
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Failed to load extractions')
      setRows(j.extractions || [])
    } catch (e: any) {
      toast(e.message || 'Failed to load extractions', 'error')
    } finally {
      setLoading(false)
    }
  }, [listingId, toast])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'approve' | 'override', payload: Record<string, unknown> = {}) => {
    setBusyId(id)
    try {
      const res = await authenticatedFetch('/api/financial/extractions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractionId: id, action, ...payload }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Action failed')
      toast(action === 'approve' ? 'Extraction approved ✅' : 'Override saved ✏️', 'success')
      setEditingId(null)
      load()
    } catch (e: any) {
      toast(e.message || 'Action failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const startEdit = (r: ExtractionRow) => {
    const base = r.broker_override || r.extracted || {}
    setForm({
      revenueTotal: base.revenueTotal != null ? String(base.revenueTotal) : '',
      expenseTotal: base.expenseTotal != null ? String(base.expenseTotal) : '',
      sde: base.sde != null ? String(base.sde) : '',
      ebitda: base.ebitda != null ? String(base.ebitda) : '',
      assets: base.assets != null ? String(base.assets) : '',
      liabilities: base.liabilities != null ? String(base.liabilities) : '',
      notes: String(base.notes || ''),
    })
    setEditingId(r.id)
  }

  const submitOverride = async (r: ExtractionRow) => {
    const payload: Record<string, unknown> = {}
    if (form.revenueTotal) payload.revenueTotal = Number(String(form.revenueTotal).replace(/[$,]/g, ''))
    if (form.expenseTotal) payload.expenseTotal = Number(String(form.expenseTotal).replace(/[$,]/g, ''))
    if (form.sde) payload.sde = Number(String(form.sde).replace(/[$,]/g, ''))
    if (form.ebitda) payload.ebitda = Number(String(form.ebitda).replace(/[$,]/g, ''))
    if (form.assets) payload.assets = Number(String(form.assets).replace(/[$,]/g, ''))
    if (form.liabilities) payload.liabilities = Number(String(form.liabilities).replace(/[$,]/g, ''))
    if (form.notes) payload.notes = form.notes
    await act(r.id, 'override', payload)
  }

  if (loading) return <LoadingState label="Loading extractions…" />
  if (rows.length === 0) {
    return (
      <div style={{ padding: '24px 16px', border: '1px dashed var(--line)', borderRadius: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13.5 }}>
        No AI extractions yet — upload documents and run <strong>Read &amp; extract</strong> to populate this review queue.
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--line)',
    fontSize: 13, background: '#fff', color: 'var(--navy)', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => {
        const data = r.broker_override || r.extracted || {}
        const pct = Math.round(r.confidence * 100)
        const confColor = pct >= 75 ? '#1e7e34' : pct >= 50 ? '#b45309' : '#b91c1c'
        return (
          <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ background: 'var(--navy)', color: '#c9a84c', borderRadius: 6, padding: '2px 9px', fontSize: 11.5, fontWeight: 800 }}>
                {r.fiscal_year ? `Year ${r.fiscal_year}` : 'No year'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{r.doc_type.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{r.financial_documents?.file_name || 'unknown file'}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span title="AI confidence" style={{ fontSize: 11.5, fontWeight: 800, color: confColor }}>
                  {pct}% conf
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: STATE_COLOR[r.review_state] }}>{STATE_LABEL[r.review_state]}</span>
              </span>
            </div>

            {/* Extracted numbers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 12 }}>
              {[
                ['Revenue', money(data.revenueTotal)],
                ['Expenses', money(data.expenseTotal)],
                ['SDE', money(data.sde)],
                ['EBITDA', money(data.ebitda)],
                ['Assets', money(data.assets)],
                ['Liabilities', money(data.liabilities)],
              ].map(([label, value]) => (
                <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Edit form (override) */}
            {editingId === r.id && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>✏️ Broker override — corrected numbers become the source of truth</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
                  {(['revenueTotal', 'expenseTotal', 'sde', 'ebitda', 'assets', 'liabilities'] as const).map((k) => (
                    <div key={k}>
                      <label style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>{k.replace(/([A-Z])/g, ' $1')}</label>
                      <input style={inputStyle} inputMode="decimal" value={formatMoneyInput(form[k])} placeholder="0" onChange={moneyChange((v) => setForm({ ...form, [k]: v }))} />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 3, textTransform: 'uppercase' }}>Notes</label>
                  <input style={inputStyle} value={form.notes} placeholder="Why are you correcting this?" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => submitOverride(r)} disabled={busyId === r.id} style={{ padding: '8px 16px', borderRadius: 8, background: '#1d4ed8', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: busyId === r.id ? 'wait' : 'pointer' }}>
                    {busyId === r.id ? 'Saving…' : '💾 Save override'}
                  </button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {r.review_state !== 'approved' && (
                <button onClick={() => act(r.id, 'approve')} disabled={busyId === r.id} style={{ padding: '8px 16px', borderRadius: 8, background: '#1e7e34', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: busyId === r.id ? 'wait' : 'pointer' }}>
                  ✓ Approve
                </button>
              )}
              {r.review_state !== 'overridden' && (
                <button onClick={() => startEdit(r)} disabled={busyId === r.id} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, fontSize: 12.5, cursor: busyId === r.id ? 'wait' : 'pointer' }}>
                  ✏️ Correct numbers
                </button>
              )}
              {r.reviewed_at && (
                <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>
                  Reviewed {new Date(r.reviewed_at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
