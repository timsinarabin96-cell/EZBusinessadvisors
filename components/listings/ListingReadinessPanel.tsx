/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchListingReadiness, type ReadinessResult, type StepReadiness } from '@/lib/listingReadiness'

// =============================================================================
// ListingReadinessPanel — the "brain" of the listing flow.
// Live 0-100 readiness score, per-step status, publish blockers and the next
// best action. Renders above the workflow steps so the agent always knows
// where the listing stands and what to do next.
// =============================================================================

export default function ListingReadinessPanel({ listingId }: { listingId: string }) {
  const [r, setR] = useState<ReadinessResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchListingReadiness(listingId)
    setR(res)
    setLoading(false)
  }, [listingId])

  useEffect(() => { load() }, [load, refreshKey])

  if (loading && !r) {
    return <div style={{ padding: '14px 16px', color: 'var(--muted)', fontSize: 13 }}>Scoring listing readiness…</div>
  }
  if (!r) return null

  const scoreColor = r.score >= 90 ? '#15803d' : r.score >= 75 ? '#b45309' : r.score >= 55 ? '#c2410c' : '#dc2626'
  const gradeColor = r.grade === 'A' ? '#15803d' : r.grade === 'B' ? '#b45309' : r.grade === 'C' ? '#c2410c' : '#dc2626'

  const statusIcon = (s: StepReadiness) =>
    s.status === 'done' ? '✅' : s.status === 'optional_done' ? '☑️' : s.status === 'partial' ? '🟡' : s.status === 'na' ? '⚪' : '🔴'

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden', marginBottom: 18, background: '#fff' }}>
      {/* Header: score + grade + next action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', background: 'linear-gradient(135deg, var(--navy), #23234a)', color: '#fff', flexWrap: 'wrap' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', border: `3px solid ${scoreColor}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{r.score}</span>
          <span style={{ fontSize: 9.5, letterSpacing: '0.08em', opacity: 0.75 }}>/100</span>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>Listing Readiness</span>
            <span style={{ background: gradeColor, color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 800 }}>{r.grade}</span>
            {r.isListed && <span style={{ background: '#15803d', borderRadius: 6, padding: '2px 8px', fontSize: 11.5, fontWeight: 700 }}>● LIVE</span>}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
            Next: <strong style={{ color: '#fff' }}>{r.nextAction}</strong>
          </div>
        </div>
        <button onClick={() => setRefreshKey((k) => k + 1)} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          ⟳ Refresh
        </button>
      </div>

      {/* Blockers — the publish gate */}
      {!r.isListed && r.blockers.length > 0 && (
        <div style={{ padding: '12px 18px', background: '#fdf3e3', borderBottom: '1px solid #f0dfc0' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#92400e' }}>🚧 Not publish-ready — {r.blockers.length} thing{r.blockers.length === 1 ? '' : 's'} blocking</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#78350f', fontSize: 12.5 }}>
            {r.blockers.slice(0, 4).map((b) => <li key={b} style={{ marginTop: 2 }}>{b}</li>)}
          </ul>
        </div>
      )}
      {!r.isListed && r.canPublish && (
        <div style={{ padding: '12px 18px', background: '#e8f7ee', borderBottom: '1px solid #c6e9d3' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#166534' }}>✅ Ready to publish — everything required is complete. Head to Step 8.</div>
        </div>
      )}

      {/* Step checklist */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 8, padding: 14 }}>
        {r.steps.map((s) => (
          <div key={s.step} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: s.status === 'done' ? '#f8fafc' : '#fffdf7', border: '1px solid #eef1f4', borderRadius: 10, padding: '9px 11px' }}>
            <span style={{ fontSize: 15 }}>{statusIcon(s)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)' }}>{s.icon} {s.label}{!s.required ? ' (opt)' : ''}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1, lineHeight: 1.35 }}>{s.note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
