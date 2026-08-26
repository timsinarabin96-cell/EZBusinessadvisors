/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/expenses — advanced platform cost center.
// Track AI/API costs (OpenAI, DeepSeek, Claude, etc.), domains, hosting,
// SMS/phone, email, tools, marketing, and subscriptions. Monthly costing
// analytics: totals, category & vendor breakdown, 6-month trend.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { EXPENSE_CATEGORIES, summarizeExpenses, fmtExpense, type Expense, type ExpenseCategory } from '@/lib/expenses'

interface ExpenseRow extends Expense {
  agencies?: { name: string } | null
}

export default function AdminExpensesPage() {
  const toast = useToast()
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    category: 'ai_api' as ExpenseCategory,
    vendor: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    recurring: false,
    paid: true,
    payment_method: '',
    payment_reference: '',
    receipt_url: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [pnl, setPnl] = useState<any>(null)

  const loadPnl = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/admin/expenses/pnl?month=${month}`)
      const j = await res.json()
      if (j.ok) setPnl(j)
    } catch { /* non-fatal */ }
  }, [month])

  useEffect(() => { loadPnl() }, [loadPnl])

  const onImportCsv = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const res = await authenticatedFetch('/api/admin/expenses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Import failed')
      toast(`📥 Imported ${j.summary.added} expenses (${j.summary.skipped} duplicates skipped, ${j.summary.aiCategorized} AI-categorized)`, 'success')
      load()
      loadPnl()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const autoSync = async () => {
    setSyncing(true)
    try {
      const res = await authenticatedFetch('/api/admin/expenses/sync', { method: 'POST' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Sync failed')
      toast(`Auto-sync done — ${j.summary.added} added, ${j.summary.skipped} skipped, ${j.summary.backfilled} re-categorized`, 'success')
      load()
      loadPnl()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSyncing(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authenticatedFetch(`/api/admin/expenses?month=${month}`)
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Failed to load')
      setRows(j.expenses || [])
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [month, toast])

  useEffect(() => { load() }, [load])

  const summary = summarizeExpenses(rows, month)
  const maxCat = Math.max(...summary.byCategory.map((c) => c.cents), 1)
  const maxVendor = Math.max(...summary.byVendor.map((v) => v.cents), 1)
  const maxMonth = Math.max(...summary.byMonth.map((m) => m.cents), 1)

  const submit = async () => {
    const amountCents = Math.round(parseFloat(form.amount.replace(/[$,]/g, '')) * 100)
    if (!form.vendor.trim() || !amountCents || amountCents <= 0) {
      toast('Vendor + valid amount required', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await authenticatedFetch('/api/admin/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: form.category,
          vendor: form.vendor.trim(),
          description: form.description.trim() || undefined,
          amount_cents: amountCents,
          expense_date: form.expense_date,
          recurring: form.recurring,
          paid: form.paid,
          payment_method: form.payment_method.trim() || undefined,
          payment_reference: form.payment_reference.trim() || undefined,
          receipt_url: form.receipt_url.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Create failed')
      toast('Expense added ✅', 'success')
      setShowForm(false)
      setForm({ category: 'ai_api', vendor: '', description: '', amount: '', expense_date: new Date().toISOString().slice(0, 10), recurring: false, paid: true, payment_method: '', payment_reference: '', receipt_url: '', notes: '' })
      load()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string, vendor: string) => {
    if (!window.confirm(`Delete "${vendor}" expense?`)) return
    try {
      const res = await authenticatedFetch(`/api/admin/expenses/${id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Delete failed')
      toast('Expense deleted', 'success')
      load()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const inputStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 13.5, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '30px 20px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>💸 Platform Expenses</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13.5 }}>
            Every cost center — AI/API usage, domains, hosting, SMS, email, tools, marketing.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 13.5 }} />
          <button onClick={autoSync} disabled={syncing} title="Pull real usage costs from Twilio, DeepSeek, Anthropic, Supabase & Vercel — AI categorizes everything" style={{ padding: '11px 20px', background: syncing ? '#aaa' : '#45a29e', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 14, cursor: syncing ? 'not-allowed' : 'pointer' }}>
            {syncing ? 'Syncing…' : '🤖 Auto-Sync Costs'}
          </button>
          <label style={{ padding: '11px 20px', background: importing ? '#aaa' : '#0e7490', color: '#fff', borderRadius: 9, fontWeight: 800, fontSize: 14, cursor: importing ? 'not-allowed' : 'pointer', display: 'inline-block' }}>
            {importing ? 'Importing…' : '📥 Import CSV'}
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportCsv(f); e.target.value = '' }} />
          </label>
          <button onClick={() => setShowForm((v) => !v)} style={{ padding: '11px 20px', background: '#1a1a2e', color: '#c9a84c', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
            {showForm ? '✕ Close' : '+ Add Expense'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 20, marginBottom: 22, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })} style={inputStyle}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Vendor *</label>
            <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. OpenAI, Vercel, Namecheap, Twilio" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Amount (USD) *</label>
            <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" inputMode="decimal" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Date</label>
            <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. DeepSeek API — August" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Payment method</label>
            <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} style={inputStyle}>
              <option value="">— select —</option>
              <option>Business card</option>
              <option>Personal card</option>
              <option>Bank transfer / ACH</option>
              <option>Wire</option>
              <option>PayPal</option>
              <option>Stripe</option>
              <option>Cash</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Payment reference #</label>
            <input value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} placeholder="e.g. card last 4 / invoice #" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Receipt URL</label>
            <input value={form.receipt_url} onChange={(e) => setForm({ ...form, receipt_url: e.target.value })} placeholder="https://…/receipt.pdf" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} /> Recurring
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} /> Paid
            </label>
            <button onClick={submit} disabled={busy} style={{ padding: '11px 22px', background: busy ? '#aaa' : '#15803d', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Saving…' : 'Save Expense'}
            </button>
          </div>
        </div>
      )}

      {loading ? <LoadingState label="Loading expenses..." /> : (
        <>
          {/* Profit & Loss — accountant view */}
          {pnl && (
            <div style={{ background: '#0b0c10', borderRadius: 16, padding: 20, marginBottom: 22, color: '#f5f5f5' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>📊 Profit & Loss — {pnl.monthLabel}</div>
                <div style={{ fontSize: 13, color: pnl.net.cents >= 0 ? '#4ade80' : '#f87171', fontWeight: 800 }}>
                  Net: {pnl.net.label} ({pnl.net.marginLabel} margin)
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#c9a84c', fontWeight: 700, marginBottom: 8 }}>Revenue</div>
                  {[
                    ['Subscriptions (MRR)', pnl.revenue.mrrLabel],
                    ['Success fees', pnl.revenue.successFeesLabel],
                    ['Featured slots', pnl.revenue.featuredLabel],
                    ['Buyer passes', pnl.revenue.buyerPassesLabel],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                      <span style={{ color: '#a0a8b4' }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderTop: '1px solid #1f2833', marginTop: 4, fontWeight: 800 }}>
                    <span>Total</span><span style={{ color: '#c9a84c' }}>{pnl.revenue.totalLabel}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#45a29e', fontWeight: 700, marginBottom: 8 }}>Expenses</div>
                  {pnl.expenses.byCategory.length === 0 && <div style={{ fontSize: 12.5, color: '#a0a8b4' }}>No costs recorded this month.</div>}
                  {pnl.expenses.byCategory.map((c: any) => (
                    <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                      <span style={{ color: '#a0a8b4' }}>{c.category}</span><span>{c.label}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderTop: '1px solid #1f2833', marginTop: 4, fontWeight: 800 }}>
                    <span>Total</span><span style={{ color: '#45a29e' }}>{pnl.expenses.totalLabel}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#a0a8b4', marginTop: 4 }}>Recurring burn: {pnl.expenses.recurringLabel}/mo</div>
                </div>
                <div style={{ alignSelf: 'center', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#7a8288', fontWeight: 700 }}>Net Result</div>
                  <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'Georgia, serif', color: pnl.net.cents >= 0 ? '#4ade80' : '#f87171', margin: '6px 0' }}>{pnl.net.label}</div>
                  <div style={{ fontSize: 12.5, color: '#a0a8b4' }}>{pnl.net.marginLabel} profit margin</div>
                </div>
              </div>
            </div>
          )}
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
            <Kpi label={`Total (${summary.monthLabel})`} value={fmtExpense(summary.totalCents)} sub={`${rows.length} entries`} />
            <Kpi label="This Month" value={fmtExpense(summary.monthCents)} sub={summary.monthLabel} accent />
            <Kpi label="Recurring (est./mo)" value={fmtExpense(summary.recurringCents)} sub="recurring items" />
            <Kpi label="Categories" value={String(summary.byCategory.length)} sub="active cost centers" />
          </div>

          {/* Trend + category + vendor */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 22 }}>
            {/* 6-month trend */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>📈 6-Month Spend Trend</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                {summary.byMonth.map((m) => (
                  <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 10.5, color: '#555', marginBottom: 4 }}>{fmtExpense(m.cents)}</div>
                    <div style={{ height: Math.max(4, (m.cents / maxMonth) * 80), background: '#c9a84c', borderRadius: '6px 6px 0 0' }} />
                    <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>{m.month}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Category breakdown */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>🧩 By Category</div>
              {summary.byCategory.length === 0 && <div style={{ color: '#999', fontSize: 13 }}>No expenses yet — add your first cost above.</div>}
              {summary.byCategory.map((c) => (
                <div key={c.category} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{c.icon} {c.label}</span>
                    <span style={{ color: '#555' }}>{fmtExpense(c.cents)} · {(c.share * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 8, background: '#f0ecdf', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(c.cents / maxCat) * 100}%`, background: 'linear-gradient(90deg,#c9a84c,#45a29e)', borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Vendor breakdown */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>🏷️ By Vendor</div>
              {summary.byVendor.length === 0 && <div style={{ color: '#999', fontSize: 13 }}>No vendor data yet.</div>}
              {summary.byVendor.map((v) => (
                <div key={v.vendor} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{v.vendor}</span>
                    <span style={{ color: '#555' }}>{fmtExpense(v.cents)} · {(v.share * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height: 8, background: '#f0ecdf', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(v.cents / maxVendor) * 100}%`, background: '#45a29e', borderRadius: 99 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Entries table */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', fontWeight: 800, fontSize: 14 }}>📋 All Entries ({rows.length})</div>
            {rows.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#999', fontSize: 13.5 }}>
                No expenses recorded for {summary.monthLabel}. Click <b>+ Add Expense</b> to log API/domain/hosting costs.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#faf9f4', textAlign: 'left' }}>
                      {['Date', 'Category', 'Vendor', 'Description', 'Amount', 'Paid via', 'Recurring', 'Paid', ''].map((h) => (
                        <th key={h} style={{ padding: '10px 14px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: '#777' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} style={{ borderTop: '1px solid #f0ecdf' }}>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{r.expense_date}</td>
                        <td style={{ padding: '10px 14px' }}>{EXPENSE_CATEGORIES.find((c) => c.id === r.category)?.icon} {CAT_LABEL(r.category)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>{r.vendor}</td>
                        <td style={{ padding: '10px 14px', color: '#555' }}>{r.description || '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtExpense(r.amount_cents)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#555' }}>
                          {r.payment_method || '—'}
                          {r.payment_reference ? <div style={{ fontSize: 11, color: '#999' }}>#{r.payment_reference}</div> : null}
                          {r.receipt_url ? <a href={r.receipt_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0e7490' }}>🧾 receipt ↗</a> : null}
                        </td>
                        <td style={{ padding: '10px 14px' }}>{r.recurring ? '🔁' : '—'}</td>
                        <td style={{ padding: '10px 14px' }}>{r.paid ? '✅' : '⏳'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <button onClick={() => remove(r.id, r.vendor)} style={{ background: 'transparent', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function CAT_LABEL(cat: string): string {
  const map: Record<string, string> = {
    ai_api: 'AI / API', hosting: 'Hosting', domain: 'Domains', sms_phone: 'SMS / Phone',
    email: 'Email', tools: 'Tools', marketing: 'Marketing', subscriptions: 'Subscriptions', other: 'Other',
  }
  return map[cat] || cat
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? '#1a1a2e' : '#fff', border: accent ? 'none' : '1px solid var(--line)', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', color: accent ? '#c9a84c' : '#888', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: accent ? '#fff' : '#1a1a2e', fontFamily: 'Georgia, serif' }}>{value}</div>
      <div style={{ fontSize: 12, color: accent ? 'rgba(255,255,255,0.6)' : '#999', marginTop: 2 }}>{sub}</div>
    </div>
  )
}
