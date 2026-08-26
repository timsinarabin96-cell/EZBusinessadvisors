/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/escrow — success-fee escrow workflow (platform admin only).
// Tracks escrow accounts through pending → funded → released → refunded, and
// releases the success fee straight into the 1099 contractor ledger.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface EscrowRow {
  id: string
  agency_id: string
  listing_id: string
  deal_id: string | null
  escrow_company: string | null
  account_ref: string | null
  amount: number | null
  status: string
  funded_at: string | null
  released_at: string | null
  notes: string | null
  created_at: string
  final_purchase_price: number | null
  closing_date: string | null
  listings?: { business_name?: string | null } | null
}

interface Contractor {
  id: string
  legal_name: string
}

const money = (n: number | null | undefined) => (n != null ? '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—')

const STATUS_COLOR: Record<string, string> = {
  pending: '#b45309',
  funded: '#1d4ed8',
  released: '#15803d',
  refunded: '#64748b',
}

export default function AdminEscrowPage() {
  const toast = useToast()
  const [rows, setRows] = useState<EscrowRow[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ listing_id: '', agency_id: '', escrow_company: '', account_ref: '', amount: '', deal_id: '', notes: '' })
  const [releasing, setReleasing] = useState<string | null>(null)
  const [releaseForm, setReleaseForm] = useState<Record<string, { contractor_id: string; fee_amount: string; payment_date: string; method: string }>>({})

  const load = useCallback(async () => {
    try {
      const [eRes, kRes] = await Promise.all([
        authenticatedFetch('/api/admin/escrow'),
        authenticatedFetch('/api/admin/1099?year=' + new Date().getFullYear()),
      ])
      const ej = await eRes.json()
      const kj = await kRes.json()
      if (!eRes.ok || !ej.ok) setError(ej.error || 'Access denied — platform admin only.')
      else setRows(ej.escrow || [])
      if (kj.ok) setContractors((kj.contractors || []).map((c: Contractor) => ({ id: c.id, legal_name: c.legal_name })))
    } catch {
      setError('Failed to load escrow accounts.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.listing_id.trim() || !form.agency_id.trim()) {
      toast('Listing ID and Agency ID are required', 'error')
      return
    }
    const res = await authenticatedFetch('/api/admin/escrow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', ...form, amount: form.amount ? Number(form.amount) : null }),
    })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Save failed', 'error'); return }
    toast('Escrow account created', 'success')
    setShowForm(false)
    setForm({ listing_id: '', agency_id: '', escrow_company: '', account_ref: '', amount: '', deal_id: '', notes: '' })
    load()
  }

  const setStatus = async (id: string, status: string) => {
    const res = await authenticatedFetch('/api/admin/escrow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', id, status }),
    })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Update failed', 'error'); return }
    toast(`Escrow → ${status}`, 'success')
    load()
  }

  const release = async (row: EscrowRow) => {
    const f = releaseForm[row.id] || { contractor_id: '', fee_amount: '', payment_date: new Date().toISOString().slice(0, 10), method: 'ach' }
    if (!f.contractor_id || !Number(f.fee_amount)) { toast('Select a contractor and enter the fee amount', 'error'); return }
    setReleasing(row.id)
    try {
      const res = await authenticatedFetch('/api/admin/escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'release', id: row.id, contractor_id: f.contractor_id, fee_amount: Number(f.fee_amount), payment_date: f.payment_date, method: f.method }),
      })
      const j = await res.json()
      if (!j.ok) { toast(j.error || 'Release failed', 'error'); return }
      toast('Escrow released → success fee recorded to 1099 ledger', 'success')
      load()
    } catch {
      toast('Release failed', 'error')
    } finally {
      setReleasing(null)
    }
  }

  const totals = {
    pending: rows.filter((r) => r.status === 'pending').length,
    funded: rows.filter((r) => r.status === 'funded').length,
    released: rows.filter((r) => r.status === 'released').length,
    value: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
  }

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>🏦 Success-Fee Escrow</div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            Closing → escrow → released success fee → 1099 contractor ledger. Platform admin only.
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ Escrow Account'}
        </button>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Pending', value: totals.pending, color: '#b45309' },
          { label: 'Funded', value: totals.funded, color: '#1d4ed8' },
          { label: 'Released', value: totals.released, color: '#15803d' },
          { label: 'Escrow value', value: money(totals.value), color: '#1a1a2e' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, color: '#1a1a2e', marginBottom: 14 }}>New escrow account</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input placeholder="Listing ID (uuid)" value={form.listing_id} onChange={(e) => setForm({ ...form, listing_id: e.target.value })} style={inputStyle} />
            <input placeholder="Agency ID (uuid)" value={form.agency_id} onChange={(e) => setForm({ ...form, agency_id: e.target.value })} style={inputStyle} />
            <input placeholder="Escrow company" value={form.escrow_company} onChange={(e) => setForm({ ...form, escrow_company: e.target.value })} style={inputStyle} />
            <input placeholder="Account reference" value={form.account_ref} onChange={(e) => setForm({ ...form, account_ref: e.target.value })} style={inputStyle} />
            <input placeholder="Amount ($)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={inputStyle} />
            <input placeholder="Deal ID (optional)" value={form.deal_id} onChange={(e) => setForm({ ...form, deal_id: e.target.value })} style={inputStyle} />
            <input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
          </div>
          <button onClick={save} style={{ marginTop: 14, background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #d8d2c4', borderRadius: 14, padding: '40px', textAlign: 'center', color: '#888', fontSize: 14 }}>
          No escrow accounts yet. When a deal closes, create one here — then release the success fee straight to the 1099 ledger.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((row) => {
            const f = releaseForm[row.id] || { contractor_id: '', fee_amount: '', payment_date: new Date().toISOString().slice(0, 10), method: 'ach' }
            const setF = (patch: Partial<typeof f>) => setReleaseForm({ ...releaseForm, [row.id]: { ...f, ...patch } })
            return (
              <div key={row.id} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 240, flex: 1 }}>
                    <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14 }}>
                      {row.listings?.business_name || 'Business'} {row.escrow_company && <span style={{ color: '#94a3b8', fontWeight: 600 }}>· {row.escrow_company}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                      Sale price {money(row.final_purchase_price)} · {row.closing_date || 'no closing date'} · Ref {row.account_ref || '—'}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                      Created {new Date(row.created_at).toLocaleDateString()}
                      {row.funded_at ? ` · Funded ${new Date(row.funded_at).toLocaleDateString()}` : ''}
                      {row.released_at ? ` · Released ${new Date(row.released_at).toLocaleDateString()}` : ''}
                    </div>
                    {row.notes && <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 2 }}>{row.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>{money(row.amount)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[row.status] || '#64748b', background: '#f8fafc', padding: '4px 10px', borderRadius: 999 }}>{row.status}</span>
                    {row.status === 'pending' && (
                      <button onClick={() => setStatus(row.id, 'funded')} style={{ background: '#1d4ed8', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Fund</button>
                    )}
                    {row.status === 'refunded' && (
                      <button onClick={() => setStatus(row.id, 'pending')} style={{ background: '#334155', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Reopen</button>
                    )}
                  </div>
                </div>

                {(row.status === 'funded' || row.status === 'pending') && (
                  <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                    <select value={f.contractor_id} onChange={(e) => setF({ contractor_id: e.target.value })} style={inputStyle}>
                      <option value="">→ 1099 contractor…</option>
                      {contractors.map((k) => <option key={k.id} value={k.id}>{k.legal_name}</option>)}
                    </select>
                    <input type="number" placeholder="Success fee ($)" value={f.fee_amount} onChange={(e) => setF({ fee_amount: e.target.value })} style={inputStyle} />
                    <input type="date" value={f.payment_date} onChange={(e) => setF({ payment_date: e.target.value })} style={inputStyle} />
                    <button onClick={() => release(row)} disabled={releasing === row.id} style={{ background: '#15803d', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                      {releasing === row.id ? '…' : 'Release → 1099'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
        💡 Releasing escrow records the success fee as a contractor payment → shows up in the 1099 module's YTD totals automatically.
        This is how the platform collects its cut at closing — verify fee math with your CPA.
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 13, fontFamily: 'inherit',
  width: '100%', boxSizing: 'border-box', background: '#fff',
}
