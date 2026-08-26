/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchStaleListingIntelligence, type StaleListingResult } from '@/lib/staleListing'
import { useToast } from '@/components/ui/Toast'

// =============================================================================
// StaleListingIntelligence — "deal doctor for listings".
// Shows which listings are going stale and why: age, views without inquiries,
// price above the market band — with a market-anchored price suggestion.
// =============================================================================

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

const SEVERITY: Record<string, { color: string; bg: string }> = {
  high: { color: '#b91c1c', bg: '#fee2e2' },
  medium: { color: '#b45309', bg: '#fdf3e3' },
  low: { color: '#64748b', bg: '#f1f5f9' },
}

export default function StaleListingPanel() {
  const toast = useToast()
  const [rows, setRows] = useState<StaleListingResult[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchStaleListingIntelligence()
    setRows(res)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const needsAttention = rows.filter((r) => r.score >= 30)
  const healthy = rows.filter((r) => r.score < 30 && r.status !== 'unpublished')

  return (
    <div className="card" style={{ padding: 18, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title">📉 Listing intelligence</div>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
            {loading ? 'Analyzing…' : `${needsAttention.length} need attention · ${healthy.length} healthy · ${rows.length} total`}
          </p>
        </div>
        <button className="btn btn-ghost" onClick={load} style={{ fontSize: 12.5, padding: '6px 12px' }}>⟳ Refresh</button>
      </div>

      {loading ? (
        <div style={{ padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>Scanning listings, views, and market bands…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>No listings yet — create one and this panel will track its health.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {needsAttention.length === 0 && (
            <div style={{ padding: '12px 14px', background: '#e8f7ee', border: '1px solid #c6e9d3', borderRadius: 10, fontSize: 13, color: '#166534', fontWeight: 600 }}>
              ✅ No stale listings — everything is converting within expectations.
            </div>
          )}
          {needsAttention.slice(0, 8).map((r) => (
            <div key={r.listingId} style={{ border: '1px solid #eef1f4', borderRadius: 10, padding: '12px 14px', background: '#fffdf7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--navy)' }}>
                  {r.businessName || 'Unnamed listing'}
                </span>
                {r.listingRef && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{r.listingRef}</span>}
                <span style={{ fontSize: 11.5, fontWeight: 800, color: r.score >= 60 ? '#b91c1c' : r.score >= 30 ? '#b45309' : '#15803d', background: r.score >= 60 ? '#fee2e2' : r.score >= 30 ? '#fdf3e3' : '#e8f7ee', padding: '3px 10px', borderRadius: 999 }}>
                  attention {r.score}/100
                </span>
                <Link href={`/dashboard/listings/${r.listingId}/workflow`} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                  Open →
                </Link>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5 }}>
                {r.ageDays > 0 ? `${r.ageDays} days listed` : 'not yet published'} · {r.viewsTotal} views ({r.views7d} this week) · {r.ndaRequests} inquiry{r.ndaRequests === 1 ? '' : 's'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {r.flags.map((f) => {
                  const sev = SEVERITY[f.severity] || SEVERITY.low
                  return (
                    <div key={f.code} style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>
                      <span style={{ display: 'inline-block', fontWeight: 800, color: sev.color, background: sev.bg, padding: '2px 8px', borderRadius: 6, marginRight: 8, fontSize: 10.5 }}>{f.title}</span>
                      {f.detail}
                    </div>
                  )
                })}
              </div>
              {r.suggestedPrice != null && (
                <div style={{ marginTop: 10, padding: '9px 12px', background: '#f4f8fc', border: '1px solid #dbe7f3', borderRadius: 8, fontSize: 12.5, color: '#1e3a5f' }}>
                  💡 <strong>Price suggestion:</strong> {money(r.suggestedPrice)} ({r.suggestedMultiple?.toFixed(1)}× {r.suggestedMultiple ? '' : ''}) — market-anchored. Discuss with the seller before changing anything.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
