/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// FinancialLedgerView — the multi-year normalized monthly P&L.
// -----------------------------------------------------------------------------
// Reads financial_ledger via /api/financial/ledger: months per fiscal year,
// revenue/expenses/net, and the source (AI extraction vs broker override).
// 'Rebuild from extractions' spreads each year's approved/overridden AI
// numbers into 12 monthly rows — the single source of truth that valuation,
// BOV, CIM, and recast consume.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { useToast } from '@/components/ui/Toast'
import { LoadingState } from '@/components/ui'

interface LedgerRow {
  fiscal_year: number
  month: number
  revenue: number
  expenses: number
  net: number
  source: string
  reviewed_at: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmt$ = (n: number) => (n == null || !Number.isFinite(n) ? '—' : '$' + Math.round(n).toLocaleString())
const fmt$K = (n: number) => (n == null || !Number.isFinite(n) ? '—' : '$' + (n / 1000).toFixed(1) + 'K')

export default function FinancialLedgerView({ listingId, onRebuilt }: { listingId: string; onRebuilt?: () => void }) {
  const toast = useToast()
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rebuilding, setRebuilding] = useState(false)
  const [selectedParent, setSelectedParent] = useState(listingId)

  const load = useCallback(async (id: string) => {
    try {
      const res = await authenticatedFetch(`/api/financial/ledger?listingId=${id}`)
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Failed to load ledger')
      setRows(j.rows || [])
    } catch (e: any) {
      toast(e.message || 'Failed to load ledger', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { if (selectedParent) load(selectedParent) }, [selectedParent, load])

  const rebuild = async () => {
    if (!selectedParent) return
    setRebuilding(true)
    try {
      const res = await authenticatedFetch('/api/financial/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: selectedParent }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Rebuild failed')
      setRows(j.rows || [])
      toast(`Ledger rebuilt — ${j.years} year(s), ${j.monthsWritten} months ✨`, 'success')
      onRebuilt?.()
    } catch (e: any) {
      toast(e.message || 'Rebuild failed', 'error')
    } finally {
      setRebuilding(false)
    }
  }

  const byYear = useMemo(() => {
    const map = new Map<number, Map<number, LedgerRow>>()
    for (const r of rows) {
      if (!map.has(r.fiscal_year)) map.set(r.fiscal_year, new Map())
      map.get(r.fiscal_year)!.set(r.month, r)
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0])
  }, [rows])

  const yearTotals = useMemo(() => {
    const map = new Map<number, { revenue: number; expenses: number; net: number; sources: Set<string> }>()
    for (const r of rows) {
      const t = map.get(r.fiscal_year) || { revenue: 0, expenses: 0, net: 0, sources: new Set<string>() }
      t.revenue += r.revenue
      t.expenses += r.expenses
      t.net += r.net
      t.sources.add(r.source)
      map.set(r.fiscal_year, t)
    }
    return map
  }, [rows])

  if (loading) return <LoadingState label="Loading ledger…" />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>
          {rows.length === 0
            ? 'No ledger rows yet — run "Read & extract", then rebuild the ledger to spread each year into monthly P&L.'
            : `${rows.length} monthly row(s) across ${byYear.length} year(s). Broker overrides show in blue.`}
        </div>
        <button onClick={rebuild} disabled={rebuilding || !selectedParent} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: rebuilding ? 'wait' : 'pointer' }}>
          {rebuilding ? 'Rebuilding…' : '🔁 Rebuild from extractions'}
        </button>
      </div>

      {byYear.length === 0 ? (
        <div style={{ padding: '28px 16px', border: '1px dashed var(--line)', borderRadius: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13.5 }}>
          No monthly P&L yet. Upload + extract documents, then rebuild the ledger.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {byYear.map(([year, months]) => {
            const t = yearTotals.get(year)
            const overrideCount = Array.from(months.values()).filter((m) => m.source === 'override').length
            return (
              <div key={year} style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px', background: 'var(--cream)', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 14 }}>📅 Year {year}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Revenue {fmt$(t?.revenue || 0)}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Expenses {fmt$(t?.expenses || 0)}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: (t?.net || 0) >= 0 ? '#1e7e34' : '#b91c1c' }}>Net {fmt$(t?.net || 0)}</span>
                  {overrideCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginLeft: 'auto' }}>✏️ {overrideCount} month(s) broker-corrected</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, padding: 10 }}>
                  {MONTHS.map((m, i) => {
                    const row = months.get(i + 1)
                    return (
                      <div key={m} style={{
                        borderRadius: 8, padding: '7px 9px',
                        background: row?.source === 'override' ? '#eff6ff' : row ? '#f8fafc' : '#fafafa',
                        border: row?.source === 'override' ? '1px solid #bfdbfe' : '1px solid var(--line)',
                        opacity: row ? 1 : 0.55,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>{m}</div>
                        {row ? (
                          <>
                            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--navy)' }}>{fmt$K(row.revenue)}</div>
                            <div style={{ fontSize: 11, color: (row.net || 0) >= 0 ? '#1e7e34' : '#b91c1c', fontWeight: 700 }}>
                              {fmt$K(row.net)} {row.source === 'override' ? '✏️' : ''}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 11, color: '#cbd5e1' }}>—</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
