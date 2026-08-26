/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// VerificationPanel — run + display the bank-vs-books check.
// -----------------------------------------------------------------------------
// One click: compares approved/overridden bank-statement deposits against
// reported revenue, stores the verdict on verified_financials, and syncs the
// public revenue_verified badge. Shows the verdict + variance report.
// =============================================================================

import { useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { useToast } from '@/components/ui/Toast'

interface Verdict {
  status: 'verified' | 'review' | 'no_bank_docs'
  reportedRevenue: number | null
  bankDeposits: number | null
  variancePct: number | null
  tolerancePct: number
  detail: { bankDocs: number; totalDeposits: number; depositYears: number[]; notes: string[] }
  verifiedAt: string
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

export default function VerificationPanel({ listingId }: { listingId: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  const run = async () => {
    setBusy(true)
    try {
      const res = await authenticatedFetch('/api/financial/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Verification failed')
      setVerdict(j.verdict)
      toast(j.verdict.status === 'verified' ? 'Bank & books match ✅' : j.verdict.status === 'review' ? 'Bank & books differ — review needed' : 'No bank deposits to compare', 'success')
    } catch (e: any) {
      toast(e.message || 'Verification failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const badge =
    verdict?.status === 'verified' ? { label: '✅ Verified', color: '#1e7e34', bg: '#f0fdf4', border: '#bbf7d0' }
      : verdict?.status === 'review' ? { label: '⚠️ Review needed', color: '#b45309', bg: '#fffbeb', border: '#fde68a' }
      : verdict?.status === 'no_bank_docs' ? { label: 'No bank docs yet', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
      : null

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20 }}>🏦</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>Bank vs. Books verification</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Compares bank-statement deposits against reported revenue — the red-flag check that powers the public ✅ Verified Revenue badge.
          </div>
        </div>
        {badge && (
          <span style={{ fontSize: 12, fontWeight: 800, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}`, padding: '6px 14px', borderRadius: 999 }}>
            {badge.label}
          </span>
        )}
        <button onClick={run} disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Checking…' : verdict ? '↻ Re-run check' : '▶ Run verification'}
        </button>
      </div>

      {verdict && verdict.status !== 'no_bank_docs' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 14 }}>
          <Metric label="Reported revenue" value={money(verdict.reportedRevenue)} />
          <Metric label="Bank deposits" value={money(verdict.bankDeposits)} />
          <Metric
            label="Variance"
            value={verdict.variancePct != null ? `${verdict.variancePct > 0 ? '+' : ''}${verdict.variancePct}%` : '—'}
            color={verdict.variancePct != null && Math.abs(verdict.variancePct) > verdict.tolerancePct ? '#b91c1c' : '#1e7e34'}
          />
          <Metric label="Tolerance" value={`±${verdict.tolerancePct}%`} />
        </div>
      )}

      {verdict && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: '#64748b', lineHeight: 1.6 }}>
          {verdict.detail.notes.map((n, i) => (
            <div key={i}>• {n}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, color = 'var(--navy)' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
