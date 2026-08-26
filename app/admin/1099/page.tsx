/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/1099 — contractor tracking for year-end 1099-NEC.
// Every agent/broker with their legal (W-9) identity, every payment made to
// them, YTD totals, IRS $600 filing-threshold flags, printable 1099 preview,
// and CSV export for your accountant. PLATFORM ADMIN ONLY.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface Contractor {
  id: string
  legal_name: string
  dba_name: string | null
  entity_type: string
  tin_type: string
  tin: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  w9_status: string
  start_date: string | null
  active: boolean
  notes: string | null
  ytd_total: number
  payment_count: number
  last_paid: string | null
  needs_1099: boolean
}

interface Payment {
  id: string
  contractor_id: string
  amount: number
  payment_date: string
  method: string
  reference: string | null
  category: string
  notes: string | null
}

const ENTITY_LABEL: Record<string, string> = {
  individual: 'Individual (SSN)',
  single_member_llc: 'Single-member LLC',
  multi_member_llc: 'Multi-member LLC',
  partnership: 'Partnership',
  corporation: 'Corporation (C)',
  s_corp: 'S-Corp',
  other: 'Other',
}

const W9_COLOR: Record<string, string> = {
  collected: '#15803d',
  pending: '#b45309',
  missing: '#b91c1c',
}

const maskTin = (tin: string | null, type: string) => {
  if (!tin) return '—'
  const digits = tin.replace(/[^0-9]/g, '')
  return type === 'ein' ? `••-••${digits.slice(-4)}` : `•••-••-${digits.slice(-4)}`
}

const EMPTY_CONTRACTOR = {
  legal_name: '', dba_name: '', entity_type: 'individual', tin_type: 'ssn', tin: '',
  address: '', city: '', state: '', zip: '', w9_status: 'missing', start_date: '', active: true, notes: '',
}

export default function Admin1099Page() {
  const toast = useToast()
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_CONTRACTOR)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Contractor | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [payTotal, setPayTotal] = useState(0)
  const [showPreview, setShowPreview] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), method: 'ach', reference: '', category: 'commission', notes: '' })

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/admin/1099?year=${year}`)
      const j = await res.json()
      if (!res.ok || !j.ok) setError(j.error || 'Access denied — platform admin only.')
      else setContractors(j.contractors || [])
    } catch {
      setError('Failed to load contractors.')
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => { load() }, [load])

  const loadPayments = useCallback(async (cid: string) => {
    const res = await authenticatedFetch(`/api/admin/1099/payments?contractorId=${cid}&year=${year}`)
    const j = await res.json()
    if (j.ok) { setPayments(j.payments || []); setPayTotal(j.total || 0) }
  }, [year])

  const openContractor = async (c: Contractor) => {
    setSelected(c)
    setShowPreview(false)
    await loadPayments(c.id)
  }

  const saveContractor = async () => {
    if (!form.legal_name.trim()) { toast('Legal name is required', 'error'); return }
    const res = await authenticatedFetch('/api/admin/1099', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
    })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Save failed', 'error'); return }
    toast(editingId ? 'Contractor updated' : 'Contractor added', 'success')
    setShowForm(false); setForm(EMPTY_CONTRACTOR); setEditingId(null)
    load()
  }

  const removeContractor = async (id: string) => {
    if (!confirm('Delete this contractor and ALL their payment history?')) return
    const res = await authenticatedFetch(`/api/admin/1099?id=${id}`, { method: 'DELETE' })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Delete failed', 'error'); return }
    toast('Deleted', 'success')
    if (selected?.id === id) setSelected(null)
    load()
  }

  const addPayment = async () => {
    if (!selected) return
    const amount = Number(payForm.amount)
    if (!amount || isNaN(amount) || amount <= 0) { toast('Enter a positive amount', 'error'); return }
    const res = await authenticatedFetch('/api/admin/1099/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractor_id: selected.id, ...payForm, amount }),
    })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Payment failed', 'error'); return }
    toast('Payment recorded', 'success')
    setPayForm({ amount: '', payment_date: new Date().toISOString().slice(0, 10), method: 'ach', reference: '', category: 'commission', notes: '' })
    await loadPayments(selected.id)
    load()
  }

  const removePayment = async (id: string) => {
    if (!confirm('Remove this payment?')) return
    const res = await authenticatedFetch(`/api/admin/1099/payments?id=${id}`, { method: 'DELETE' })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Delete failed', 'error'); return }
    toast('Removed', 'success')
    if (selected) await loadPayments(selected.id)
    load()
  }

  const exportCsv = () => {
    const header = 'Legal Name,DBA,Entity Type,TIN (masked),Address,City,State,Zip,W9 Status,YTD Total ($),Payments,1099 Required\n'
    const rows = contractors.map((c) =>
      [c.legal_name, c.dba_name || '', ENTITY_LABEL[c.entity_type] || c.entity_type, maskTin(c.tin, c.tin_type),
        c.address || '', c.city || '', c.state || '', c.zip || '', c.w9_status, c.ytd_total.toFixed(2), c.payment_count,
        c.needs_1099 ? 'YES' : 'no'].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `1099-contractors-${year}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const yearTotal = contractors.reduce((s, c) => s + c.ytd_total, 0)
  const needsCount = contractors.filter((c) => c.needs_1099).length

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>🧾 1099 Contractors</div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            Legal (W-9) identity + every payment — year-end 1099-NEC in one click.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 13, background: '#fff' }}>
            {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportCsv} style={{ background: '#15803d', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>⬇️ CSV</button>
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(EMPTY_CONTRACTOR) }} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {showForm ? 'Cancel' : '+ Contractor'}
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: `${year} paid out`, value: `$${yearTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: '#1a1a2e' },
          { label: 'Contractors', value: contractors.length, color: '#334155' },
          { label: '1099 needed (≥$600)', value: needsCount, color: needsCount > 0 ? '#b45309' : '#15803d' },
          { label: 'W-9 missing', value: contractors.filter((c) => c.w9_status !== 'collected').length, color: '#b91c1c' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      {/* Add/edit form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, color: '#1a1a2e', marginBottom: 14 }}>{editingId ? 'Edit contractor' : 'New contractor'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input placeholder="Legal name (W-9, must match IRS)" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} style={inputStyle} />
            <input placeholder="DBA name (if different)" value={form.dba_name} onChange={(e) => setForm({ ...form, dba_name: e.target.value })} style={inputStyle} />
            <select value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })} style={inputStyle}>
              {Object.entries(ENTITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={form.tin_type} onChange={(e) => setForm({ ...form, tin_type: e.target.value })} style={inputStyle}>
                <option value="ssn">SSN</option>
                <option value="ein">EIN</option>
              </select>
              <input placeholder={form.tin_type === 'ein' ? 'EIN (00-0000000)' : 'SSN'} value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} style={inputStyle} />
            </div>
            <input placeholder="Street address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
            <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} style={inputStyle} />
              <input placeholder="ZIP" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} style={inputStyle} />
            </div>
            <select value={form.w9_status} onChange={(e) => setForm({ ...form, w9_status: e.target.value })} style={inputStyle}>
              <option value="missing">W-9: Missing</option>
              <option value="pending">W-9: Pending</option>
              <option value="collected">W-9: Collected</option>
            </select>
            <input placeholder="Start date (YYYY-MM-DD)" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={inputStyle} />
            <input placeholder="Notes (contract terms, contact…)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
            </label>
            <button onClick={saveContractor} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 20 }}>
          {/* Contractor list */}
          <div>
            {contractors.length === 0 ? (
              <div style={{ background: '#fff', border: '1px dashed #d8d2c4', borderRadius: 14, padding: '40px', textAlign: 'center', color: '#888', fontSize: 14 }}>
                No contractors yet. Add your agents/brokers with their W-9 info — payments tracked here feed your year-end 1099s.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contractors.map((c) => (
                  <div key={c.id} onClick={() => openContractor(c)} style={{ background: selected?.id === c.id ? '#faf7ee' : '#fff', border: selected?.id === c.id ? '2px solid #1a1a2e' : '1px solid #ece8dc', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14 }}>
                          {c.legal_name} {!c.active && <span style={{ fontSize: 11, color: '#94a3b8' }}>(inactive)</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                          {ENTITY_LABEL[c.entity_type] || c.entity_type} · {maskTin(c.tin, c.tin_type)}
                          {c.dba_name ? ` · DBA ${c.dba_name}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: W9_COLOR[c.w9_status] || '#64748b', background: '#f8fafc', padding: '3px 10px', borderRadius: 999 }}>
                          W-9: {c.w9_status}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: c.needs_1099 ? '#b45309' : '#1a1a2e' }}>
                          ${c.ytd_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        {c.needs_1099 && <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#b45309', padding: '3px 8px', borderRadius: 999 }}>1099</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail: payments + preview */}
          {selected && (
            <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '20px 24px', alignSelf: 'start' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e' }}>{selected.legal_name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    {ENTITY_LABEL[selected.entity_type]} · {maskTin(selected.tin, selected.tin_type)} · {selected.city || '—'}, {selected.state || ''} {selected.zip || ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowPreview(!showPreview) }} style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    {showPreview ? 'Hide 1099 Preview' : '👁 1099 Preview'}
                  </button>
                  <button onClick={() => { setShowForm(true); setEditingId(selected.id); setForm({ legal_name: selected.legal_name, dba_name: selected.dba_name || '', entity_type: selected.entity_type, tin_type: selected.tin_type, tin: selected.tin || '', address: selected.address || '', city: selected.city || '', state: selected.state || '', zip: selected.zip || '', w9_status: selected.w9_status, start_date: selected.start_date || '', active: selected.active, notes: selected.notes || '' }) }} style={{ background: '#334155', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✏️ Edit</button>
                </div>
              </div>

              {showPreview && (
                <div style={{ marginTop: 16, border: '2px solid #1a1a2e', borderRadius: 12, padding: '20px 24px', background: '#fffdf7' }}>
                  <div style={{ fontSize: 11, color: '#666', textAlign: 'center', letterSpacing: '.12em' }}>VOID — PREVIEW (use IRS forms for filing)</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', textAlign: 'center', margin: '8px 0 2px' }}>1099-NEC Preview · {year}</div>
                  <div style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 14 }}>Nonemployee Compensation</div>
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    <div><strong>PAYER:</strong> EZ Business Advisors LLC — Harrisburg, PA</div>
                    <div><strong>RECIPIENT:</strong> {selected.legal_name}{selected.dba_name ? ` (${selected.dba_name})` : ''}</div>
                    <div><strong>TIN:</strong> {maskTin(selected.tin, selected.tin_type)}</div>
                    <div><strong>ADDRESS:</strong> {[selected.address, selected.city, selected.state, selected.zip].filter(Boolean).join(', ') || '—'}</div>
                    <div style={{ marginTop: 10 }}><strong>Box 1 — Nonemployee compensation ({year}):</strong> ${selected.ytd_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    {selected.needs_1099
                      ? <div style={{ marginTop: 8, fontSize: 12, color: '#15803d', fontWeight: 700 }}>✓ Over $600 — 1099-NEC required. File by Jan 31.</div>
                      : <div style={{ marginTop: 8, fontSize: 12, color: '#b45309', fontWeight: 700 }}>Under $600 — no 1099-NEC required for this year (verify with your CPA).</div>}
                  </div>
                  <button onClick={() => window.print()} style={{ marginTop: 14, background: '#1a1a2e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>🖨️ Print Preview</button>
                </div>
              )}

              {/* Payment form */}
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input placeholder="Amount ($)" type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} style={inputStyle} />
                <input placeholder="Date (YYYY-MM-DD)" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} style={inputStyle} />
                <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} style={inputStyle}>
                  {['ach', 'check', 'cash', 'stripe', 'paypal', 'other'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                </select>
                <select value={payForm.category} onChange={(e) => setPayForm({ ...payForm, category: e.target.value })} style={inputStyle}>
                  {['commission', 'bonus', 'referral', 'retainer', 'other'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <input placeholder="Reference (check #, ACH ref…)" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
                <button onClick={addPayment} style={{ gridColumn: '1 / -1', background: '#15803d', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Record Payment</button>
              </div>

              {/* Payment list */}
              <div style={{ marginTop: 16, fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                {year} payments — <span style={{ color: '#1a1a2e' }}>${payTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              {payments.length === 0 ? (
                <div style={{ fontSize: 13, color: '#aaa', marginTop: 8 }}>No payments recorded for {year}.</div>
              ) : (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {payments.map((p) => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #f1ede3', borderRadius: 10, padding: '9px 12px', fontSize: 13 }}>
                      <div>
                        <span style={{ fontWeight: 800, color: '#1a1a2e' }}>${Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span style={{ color: '#94a3b8', marginLeft: 8 }}>{p.payment_date} · {p.method.toUpperCase()} · {p.category}</span>
                        {p.reference && <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 2 }}>{p.reference}</div>}
                      </div>
                      <button onClick={() => removePayment(p.id)} style={{ background: 'none', border: 'none', color: '#b91c1c', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
        ⚠️ Not tax advice — the $600 threshold and 1099-NEC classification are built in as a guide; confirm rules with your CPA before filing.
        TINs are admin-only and masked in this UI. File 1099-NEC by <strong>January 31</strong> — I can add a seasonal reminder.
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 13, fontFamily: 'inherit',
  width: '100%', boxSizing: 'border-box', background: '#fff',
}
