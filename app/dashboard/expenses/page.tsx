/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /dashboard/expenses — tenant expense view (agency owners/admins).
// Each sold CRM sees ONLY its own expenses: its own AI keys, subscriptions,
// and tools. Platform costs and other tenants are invisible (server-scoped).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

interface ExpenseRow {
  id: string
  category: string
  vendor: string
  description: string | null
  amount_cents: number
  expense_date: string
  recurring: boolean
  paid: boolean
  agencies?: { name: string } | null
}

const CATEGORY_ICON: Record<string, string> = {
  ai_api: '🤖', hosting: '🖥️', domain: '🌐', sms_phone: '📱', email: '✉️',
  tools: '🧰', marketing: '📣', subscriptions: '🔁', other: '📦',
}

const money = (cents: number) => '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function TenantExpensesPage() {
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [summary, setSummary] = useState<{ total: number; byCategory: Record<string, number>; byVendor: Record<string, number> }>({ total: 0, byCategory: {}, byVendor: {} })
  const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/expenses')
      const j = await res.json()
      if (!res.ok || !j.ok) setError(j.error || 'Failed to load expenses')
      else {
        setRows(j.expenses || [])
        setSummary(j.summary || { total: 0, byCategory: {}, byVendor: {} })
        setAgencies(j.agencies || [])
      }
    } catch {
      setError('Failed to load expenses.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const topCategories = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const topVendors = Object.entries(summary.byVendor).sort((a, b) => b[1] - a[1]).slice(0, 6)

  return (
    <AppShell active="Expenses">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>🧾 Expenses</div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            {agencies.length > 0 ? `Your agency: ${agencies.map((a) => a.name).join(', ')} — your own costs, synced daily.` : 'Your agency costs — synced daily from providers.'}
          </div>
        </div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: 10, marginBottom: 16 }}>{error}</div>}

        {loading ? (
          <LoadingState />
        ) : (
          <>
            {/* Summary strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Total spend</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>{money(summary.total)}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Entries</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>{rows.length}</div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Biggest category</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>
                  {topCategories[0] ? `${CATEGORY_ICON[topCategories[0][0]] || ''} ${topCategories[0][0]} — ${money(topCategories[0][1])}` : '—'}
                </div>
              </div>
            </div>

            {/* Category breakdown */}
            {topCategories.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '18px 22px', marginBottom: 20 }}>
                <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14, marginBottom: 12 }}>By category</div>
                {topCategories.map(([cat, amt]) => (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 110, fontSize: 12.5, color: '#666' }}>{CATEGORY_ICON[cat] || ''} {cat}</span>
                    <div style={{ flex: 1, height: 8, background: '#f1ede3', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${summary.total ? Math.min(100, (amt / summary.total) * 100) : 0}%`, background: '#1a1a2e', borderRadius: 999 }} />
                    </div>
                    <span style={{ width: 90, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#1a1a2e' }}>{money(amt)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Vendor breakdown */}
            {topVendors.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '18px 22px', marginBottom: 20 }}>
                <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14, marginBottom: 12 }}>By vendor</div>
                {topVendors.map(([vendor, amt]) => (
                  <div key={vendor} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f7f4ec', fontSize: 13 }}>
                    <span style={{ color: '#444' }}>{vendor}</span>
                    <span style={{ fontWeight: 700, color: '#1a1a2e' }}>{money(amt)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Ledger */}
            <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '18px 22px' }}>
              <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14, marginBottom: 12 }}>Ledger</div>
              {rows.length === 0 ? (
                <div style={{ color: '#aaa', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No expenses recorded for your agency yet — they sync automatically from connected providers.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((e) => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #f1ede3', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: '#1a1a2e' }}>{CATEGORY_ICON[e.category] || ''} {e.vendor}</div>
                        {e.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{e.description}</div>}
                        <div style={{ fontSize: 11.5, color: '#aaa', marginTop: 2 }}>{fmtDate(e.expense_date)}{e.recurring ? ' · recurring' : ''}</div>
                      </div>
                      <div style={{ fontWeight: 800, color: '#1a1a2e' }}>{money(e.amount_cents)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
