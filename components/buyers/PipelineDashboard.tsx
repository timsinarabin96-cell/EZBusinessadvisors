/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authHeaders } from '@/lib/authToken'
import { STAGE_META, BUYER_STAGES } from '@/lib/buyerPipelineCore'

// =============================================================================
// PipelineDashboard — agency-wide buyer pipeline health.
// Funnel across every listing, conversion rates, heat distribution, and a
// per-listing breakdown. Drives /dashboard/pipeline.
// =============================================================================

export default function PipelineDashboard() {
  const router = useRouter()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/buyers/pipeline-stats', { headers: authHeaders() })
        const j = await res.json()
        if (!cancelled && j.ok) setData(j)
      } catch { if (!cancelled) setData(null) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading pipeline health…</div>

  const funnel = data?.funnel || {}
  const maxFunnel = Math.max(1, ...BUYER_STAGES.map((s) => funnel[s] || 0))
  const conv = data?.conversions || {}
  const heat = data?.heat || { hot: 0, warm: 0, cool: 0, cold: 0 }

  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 800 }}>Pipeline Health</div>
        <h1 style={{ margin: '6px 0 0', fontSize: 26, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>Your buyer funnel, across every deal</h1>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--muted)', maxWidth: 640, lineHeight: 1.6 }}>
          {data?.totalBuyers || 0} buyers tracked · {data?.activeBuyers || 0} active right now. The funnel shows where deals stall — fix the stage with the biggest drop.
        </p>
      </div>

      {/* Funnel bar */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 20, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 14 }}>📊 Funnel</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {BUYER_STAGES.map((s) => {
            const count = funnel[s] || 0
            const pct = Math.round((count / maxFunnel) * 100)
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 110, fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{STAGE_META[s].icon} {STAGE_META[s].label}</span>
                <div style={{ flex: 1, height: 22, background: '#f0f3f7', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: s === 'closed' ? '#16a34a' : s === 'lost' ? '#dc2626' : 'linear-gradient(90deg,#1a1a2e,#0f3460)', borderRadius: 6, transition: 'width .4s ease' }} />
                </div>
                <span style={{ width: 34, textAlign: 'right', fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>{count}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 16, paddingTop: 14, borderTop: '1px solid #eef1f5', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Qualified → LOI: <strong style={{ color: 'var(--navy)' }}>{conv.toLoi === null ? '—' : `${conv.toLoi}%`}</strong></div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Qualified → Closed: <strong style={{ color: 'var(--navy)' }}>{conv.toClosed === null ? '—' : `${conv.toClosed}%`}</strong></div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>New → Closed: <strong style={{ color: 'var(--navy)' }}>{conv.overall === null ? '—' : `${conv.overall}%`}</strong></div>
        </div>
      </div>

      {/* Heat distribution */}
      <div className="pipeline-dash-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 14 }}>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 10 }}>🔥 Buyer heat</div>
          {[
            { label: 'Hot (70+)', value: heat.hot, color: '#b91c1c' },
            { label: 'Warm (40-69)', value: heat.warm, color: '#9a6700' },
            { label: 'Cool (15-39)', value: heat.cool, color: '#2563eb' },
            { label: 'Cold (<15)', value: heat.cold, color: '#6b7280' },
          ].map((h) => (
            <div key={h.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid #f3f5f8' }}>
              <span style={{ color: h.color, fontWeight: 700 }}>{h.label}</span>
              <strong style={{ color: 'var(--navy)' }}>{h.value}</strong>
            </div>
          ))}
        </div>

        {/* Per-listing breakdown */}
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18, gridColumn: 'span 2' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 10 }}>📋 Per listing</div>
          {(!data?.perListing || data.perListing.length === 0) ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No buyers tracked yet. Add buyers in a listing's Step 9 — they show up here instantly.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.perListing.slice(0, 12).map((l: any) => (
                <button
                  key={l.listingId}
                  onClick={() => router.push(`/dashboard/studio?phase=sell&listing=${l.listingId}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid #e7edf4', background: '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.businessName || 'Unnamed listing'}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l.active} active</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: l.hot > 0 ? '#b91c1c' : 'var(--muted)' }}>{l.hot > 0 ? `${l.hot} 🔥` : ''}</span>
                  <span style={{ fontSize: 11.5, color: '#166534', fontWeight: 700 }}>{l.closed > 0 ? `${l.closed} closed` : ''}</span>
                  <span style={{ fontSize: 13 }}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
