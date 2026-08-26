'use client'

// =============================================================================
// /admin/money — Revenue ops (super admin only).
// Failed-payment watchlist + manual subscription adjustments + success-fee
// ledger (the platform's transaction cut) with CSV export.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface SubRow {
  id: string
  profile_id: string
  email: string
  full_name: string
  tier: string
  status: string
  days_overdue: number
  current_period_end: string | null
  created_at: string | null
}

interface FeeRow {
  id: string
  agency_name: string
  business_name: string
  sale_price: number
  fee_percent: number
  fee_cents: number
  status: string
  paid_at: string | null
  created_at: string | null
}

export default function AdminMoneyPage() {
  const toast = useToast()
  const [watchlist, setWatchlist] = useState<SubRow[]>([])
  const [subs, setSubs] = useState<SubRow[]>([])
  const [fees, setFees] = useState<FeeRow[]>([])
  const [feeTotals, setFeeTotals] = useState<Record<string, number>>({})
  const [tab, setTab] = useState<'watchlist' | 'subscriptions' | 'fees'>('watchlist')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [subRes, feeRes] = await Promise.all([
        authenticatedFetch('/api/admin/subscriptions?scope=watchlist'),
        authenticatedFetch('/api/admin/subscriptions?scope=success-fees'),
      ])
      const s = await subRes.json()
      const f = await feeRes.json()
      if (!subRes.ok || !s.ok) { setError(s.error || 'Access denied'); return }
      setWatchlist(s.watchlist || [])
      setSubs(s.subscriptions || [])
      if (feeRes.ok && f.ok) { setFees(f.fees || []); setFeeTotals(f.totals || {}) }
    } catch { setError('Failed to load revenue data.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const adjust = async (id: string, patch: Record<string, unknown>) => {
    setBusy(id)
    try {
      const res = await authenticatedFetch('/api/admin/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const j = await res.json()
      if (j.ok) { toast('Subscription updated ✅', 'success'); load() } else toast(j.error || 'Failed', 'error')
    } finally { setBusy(null) }
  }

  const exportCSV = (rows: any[], filename: string) => {
    if (!rows.length) { toast('Nothing to export', 'error'); return }
    const headers = Object.keys(rows[0])
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    toast('CSV exported 📄', 'success')
  }

  const money = (cents: number | null | undefined) => (cents == null ? '—' : '$' + (Number(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 }))

  if (loading) return <LoadingState label="Loading revenue ops..." />
  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🔐</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e' }}>Platform Admin Only</h1>
        <p style={{ color: '#888' }}>{error}</p>
        <Link href="/auth" style={{ display: 'inline-block', marginTop: 16, background: '#1a1a2e', color: '#fff', padding: '11px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>Sign in as admin</Link>
      </div>
    )
  }

  const tabs = [
    { key: 'watchlist', label: `⚠️ Watchlist (${watchlist.length})` },
    { key: 'subscriptions', label: `💳 All Subscriptions (${subs.length})` },
    { key: 'fees', label: `💎 Success Fees (${fees.length})` },
  ]

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Platform Control</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>Money Ops</h1>
        <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>Failed payments, subscription fixes, and the success-fee ledger.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{ padding: '9px 16px', borderRadius: 99, border: '1px solid #e2e8f0', background: tab === t.key ? '#1a1a2e' : '#fff', color: tab === t.key ? '#c9a84c' : '#334155', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
        <button onClick={() => exportCSV(tab === 'fees' ? fees : tab === 'subscriptions' ? subs : watchlist, `${tab}-export.csv`)} style={{ marginLeft: 'auto', padding: '9px 16px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', color: '#334155', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          ⬇️ Export CSV
        </button>
      </div>

      {tab === 'watchlist' && (
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, overflowX: 'auto' }}>
          {watchlist.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: '48px 20px' }}><div style={{ fontSize: 34, marginBottom: 10 }}>✅</div><div style={{ fontWeight: 600, color: '#64748b' }}>No failed payments — all clear</div></div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#1a1a2e', borderBottom: '2px solid #1a1a2e' }}>
                  <th style={{ padding: '10px 12px' }}>User</th>
                  <th style={{ padding: '10px 12px' }}>Tier</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Overdue</th>
                  <th style={{ padding: '10px 12px' }}>Period End</th>
                  <th style={{ padding: '10px 12px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #ece8dc', background: s.days_overdue > 7 ? '#fef2f2' : undefined }}>
                    <td style={{ padding: '10px 12px' }}><b>{s.full_name || '—'}</b><div style={{ fontSize: 12, color: '#888' }}>{s.email}</div></td>
                    <td style={{ padding: '10px 12px' }}>{s.tier}</td>
                    <td style={{ padding: '10px 12px' }}><span style={{ background: s.status === 'past_due' ? '#ef44441a' : '#f59e0b1a', color: s.status === 'past_due' ? '#b91c1c' : '#b45309', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{s.status}</span></td>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: s.days_overdue > 7 ? '#b91c1c' : '#b45309' }}>{s.days_overdue > 0 ? `${s.days_overdue}d` : '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#888' }}>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn color="#15803d" bg="#22c55e1a" disabled={busy === s.id} onClick={() => adjust(s.id, { action: 'mark_paid' })}>Mark Paid</Btn>
                        <Btn color="#64748b" bg="#94a3b81a" disabled={busy === s.id} onClick={() => adjust(s.id, { action: 'cancel' })}>Cancel</Btn>
                        <Btn color="#b91c1c" bg="#ef44441a" disabled={busy === s.id} onClick={() => adjust(s.id, { action: 'refund' })}>Refund</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'subscriptions' && (
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#1a1a2e', borderBottom: '2px solid #1a1a2e' }}>
                <th style={{ padding: '10px 12px' }}>User</th>
                <th style={{ padding: '10px 12px' }}>Tier</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Adjust</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ece8dc' }}>
                  <td style={{ padding: '10px 12px' }}><b>{s.full_name || '—'}</b><div style={{ fontSize: 12, color: '#888' }}>{s.email}</div></td>
                  <td style={{ padding: '10px 12px' }}>
                    <select value={s.tier} onChange={(e) => adjust(s.id, { tier: e.target.value })} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d8d2c2', fontSize: 12.5 }}>
                      <option value="starter">starter</option>
                      <option value="professional">professional</option>
                      <option value="enterprise">enterprise</option>
                      <option value="license">license</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select value={s.status} onChange={(e) => adjust(s.id, { status: e.target.value })} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d8d2c2', fontSize: 12.5 }}>
                      <option value="trialing">trialing</option>
                      <option value="active">active</option>
                      <option value="past_due">past_due</option>
                      <option value="canceled">canceled</option>
                      <option value="refunded">refunded</option>
                    </select>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#888' }}>created {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'fees' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <FeeStat label="Recorded" value={money(feeTotals.recorded)} color="#64748b" />
            <FeeStat label="Invoiced" value={money(feeTotals.invoiced)} color="#1d4ed8" />
            <FeeStat label="Paid" value={money(feeTotals.paid)} color="#15803d" />
            <FeeStat label="Waived" value={money(feeTotals.waived)} color="#94a3b8" />
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#1a1a2e', borderBottom: '2px solid #1a1a2e' }}>
                  <th style={{ padding: '10px 12px' }}>Business</th>
                  <th style={{ padding: '10px 12px' }}>Agency</th>
                  <th style={{ padding: '10px 12px' }}>Sale Price</th>
                  <th style={{ padding: '10px 12px' }}>Fee</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Created</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid #ece8dc' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{f.business_name}</td>
                    <td style={{ padding: '10px 12px' }}>{f.agency_name}</td>
                    <td style={{ padding: '10px 12px' }}>{money(Math.round(f.sale_price * 100))}</td>
                    <td style={{ padding: '10px 12px' }}>{money(f.fee_cents)} <span style={{ color: '#94a3b8', fontSize: 11.5 }}>({(Number(f.fee_percent) * 100).toFixed(1)}%)</span></td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: f.status === 'paid' ? '#22c55e1a' : f.status === 'waived' ? '#94a3b81a' : '#f59e0b1a', color: f.status === 'paid' ? '#15803d' : f.status === 'waived' ? '#64748b' : '#b45309', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{f.status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#888' }}>{f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function FeeStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 11.5, color: '#888', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  )
}

function Btn({ children, onClick, color, bg, disabled }: { children: React.ReactNode; onClick: () => void; color: string; bg: string; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} style={{ background: bg, color, padding: '6px 11px', borderRadius: 7, fontSize: 12, fontWeight: 800, border: 'none', cursor: disabled ? 'wait' : 'pointer' }}>{children}</button>
}
