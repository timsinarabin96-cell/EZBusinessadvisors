/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/commission-tracker — success fees on closed deals (admin only).
// Lists every commission with the final purchase price, computes the success
// fee (amount or price × pct), and records payments straight into the 1099
// contractor ledger — one click from closing to year-end filing.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface CommissionRow {
  id: string
  listing_id: string | null
  deal_id: string | null
  agent_id: string | null
  agent_name: string | null
  business_name: string | null
  final_purchase_price: number
  commission_percentage: number
  commission_amount: number
  success_fee: number
  paid_status: string
  paid_at: string | null
  closing_date: string | null
  created_at: string
}

interface Contractor {
  id: string
  legal_name: string
}

const money = (n: number | null | undefined) => (n != null ? '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—')

export default function AdminCommissionTrackerPage() {
  const toast = useToast()
  const [commissions, setCommissions] = useState<CommissionRow[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState<string | null>(null)
  const [payForm, setPayForm] = useState<Record<string, { contractor_id: string; amount: string; payment_date: string; method: string }>>({})

  const load = useCallback(async () => {
    try {
      const [cRes, kRes] = await Promise.all([
        authenticatedFetch('/api/admin/commission-tracker'),
        authenticatedFetch('/api/admin/1099?year=' + new Date().getFullYear()),
      ])
      const cj = await cRes.json()
      const kj = await kRes.json()
      if (!cRes.ok || !cj.ok) setError(cj.error || 'Access denied.')
      else setCommissions(cj.commissions || [])
      if (kj.ok) setContractors((kj.contractors || []).map((c: Contractor) => ({ id: c.id, legal_name: c.legal_name })))
    } catch {
      setError('Failed to load commission tracker.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const record = async (c: CommissionRow) => {
    const f = payForm[c.id] || { contractor_id: '', amount: String(c.success_fee || ''), payment_date: new Date().toISOString().slice(0, 10), method: 'ach' }
    if (!f.contractor_id) { toast('Select a contractor first', 'error'); return }
    setRecording(c.id)
    try {
      const res = await authenticatedFetch('/api/admin/commission-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commission_id: c.id, contractor_id: f.contractor_id, amount: Number(f.amount), payment_date: f.payment_date, method: f.method }),
      })
      const j = await res.json()
      if (!j.ok) { toast(j.error || 'Record failed', 'error'); return }
      toast('Payment recorded → 1099 ledger', 'success')
      load()
    } catch {
      toast('Record failed', 'error')
    } finally {
      setRecording(null)
    }
  }

  const totalFees = commissions.reduce((s, c) => s + c.success_fee, 0)
  const pending = commissions.filter((c) => c.paid_status !== 'paid')
  const pendingTotal = pending.reduce((s, c) => s + c.success_fee, 0)

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>💰 Commission Tracker</div>
        <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
          Success fees on closed deals — record payments straight into the 1099 contractor ledger.
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total success fees', value: money(totalFees), color: '#1a1a2e' },
          { label: 'Unpaid / pending', value: `${pending.length} · ${money(pendingTotal)}`, color: pending.length ? '#b45309' : '#15803d' },
          { label: 'Closed commissions', value: commissions.length, color: '#334155' },
          { label: 'Paid', value: commissions.filter((c) => c.paid_status === 'paid').length, color: '#15803d' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <LoadingState />
      ) : commissions.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c4', borderRadius: 14, padding: '40px', textAlign: 'center', color: '#888', fontSize: 14 }}>
          No commissions tracked yet. Once deals close, their success fees show up here — ready to record into 1099.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {commissions.map((c) => {
            const f = payForm[c.id] || { contractor_id: '', amount: String(c.success_fee || ''), payment_date: new Date().toISOString().slice(0, 10), method: 'ach' }
            const setF = (patch: Partial<typeof f>) => setPayForm({ ...payForm, [c.id]: { ...f, ...patch } })
            return (
              <div key={c.id} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 240, flex: 1 }}>
                    <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14 }}>
                      {c.business_name || 'Business'} {c.agent_name && <span style={{ color: '#94a3b8', fontWeight: 600 }}>· {c.agent_name}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                      Sale price {money(c.final_purchase_price)} · {c.commission_percentage || c.commission_amount ? `${c.commission_percentage || '—'}% / $${c.commission_amount || 0}` : ''} · {c.closing_date || 'no closing date'}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      {c.paid_status === 'paid' ? `Paid ${c.paid_at ? new Date(c.paid_at).toLocaleDateString() : ''}` : 'Pending'}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: c.paid_status === 'paid' ? '#15803d' : '#1a1a2e' }}>{money(c.success_fee)}</div>
                </div>

                {c.paid_status !== 'paid' && (
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                    <select value={f.contractor_id} onChange={(e) => setF({ contractor_id: e.target.value })} style={inputStyle}>
                      <option value="">→ 1099 contractor…</option>
                      {contractors.map((k) => <option key={k.id} value={k.id}>{k.legal_name}</option>)}
                    </select>
                    <input type="number" value={f.amount} onChange={(e) => setF({ amount: e.target.value })} style={inputStyle} />
                    <input type="date" value={f.payment_date} onChange={(e) => setF({ payment_date: e.target.value })} style={inputStyle} />
                    <button onClick={() => record(c)} disabled={recording === c.id} style={{ background: '#15803d', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                      {recording === c.id ? '…' : '→ 1099'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
        💡 Recording a payment here creates a contractor_payment → shows up in the 1099 module's YTD totals automatically.
        Success fee = commission_amount, or final purchase price × percentage when amount isn't set. Verify fee math with your CPA.
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 13, fontFamily: 'inherit',
  width: '100%', boxSizing: 'border-box', background: '#fff',
}
