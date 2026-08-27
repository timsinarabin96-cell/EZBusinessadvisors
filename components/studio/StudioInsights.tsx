/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authHeaders } from '@/lib/authToken'

// =============================================================================
// StudioInsights — the advanced AI rail cards for the AI Deal Studio.
// -----------------------------------------------------------------------------
//  · PipelineStatusCard — "AI is working: recast ✅ BOV ✅ CIM ⏳" with a
//    Run AI pipeline button (auto-generates recast → BOV → CIM → BLI).
//  · SellerApprovalCard  — seller approval state + link for one-tap approval.
//  · DealPulseCard       — live deal heartbeat (readiness blocking summary).
//  · RiskCard            — standing red-flag/blocking summary during Verify.
// All wire to existing endpoints — no new backends, just surface them.
// =============================================================================

const PIPELINE_DOCS: Array<{ key: string; label: string; category: string }> = [
  { key: 'recast', label: 'Recast', category: 'recast' },
  { key: 'bov', label: 'BOV', category: 'bov' },
  { key: 'cim', label: 'CIM', category: 'cim' },
  { key: 'bli', label: 'BLI', category: 'bli' },
]

// ---------------------------------------------------------------------------
// Pipeline status — "AI is working" card
// ---------------------------------------------------------------------------
export function PipelineStatusCard({ listingId, businessName }: { listingId: string; businessName?: string | null }) {
  const toast = useToast()
  const [docs, setDocs] = useState<any[]>([])
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/financial/extractions?listingId=${encodeURIComponent(listingId)}&mode=docs`, { headers: authHeaders() })
      const j = await res.json()
      setDocs(j.docs || [])
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { load() }, [load])

  const runPipeline = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/financial/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ listingId }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Pipeline failed')
      toast('AI pipeline finished — recast → BOV → CIM → BLI generated ✨', 'success')
      load()
    } catch (e: any) {
      toast(e.message || 'Pipeline failed — add financials first', 'error')
    } finally {
      setRunning(false)
    }
  }

  const hasDoc = (category: string) => docs.some((d) => String(d.category || '').toLowerCase().includes(category))

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 10 }}>🤖 AI Document Pipeline</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PIPELINE_DOCS.map((d) => {
          const done = hasDoc(d.category)
          return (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ fontSize: 14 }}>{done ? '✅' : '⏳'}</span>
              <span style={{ fontWeight: 700, color: done ? '#166534' : 'var(--muted)' }}>{d.label}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: done ? '#16a34a' : '#b6bdc7', fontSize: 11.5 }}>{done ? 'done' : 'pending'}</span>
            </div>
          )
        })}
      </div>
      <button
        onClick={runPipeline}
        disabled={running || loading}
        style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: running || loading ? 'not-allowed' : 'pointer', opacity: running || loading ? 0.6 : 1 }}
      >
        {running ? '⚙️ AI is working…' : '⚙️ Run AI pipeline (recast → BOV → CIM → BLI)'}
      </button>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        {businessName || 'This listing'} — documents generate from the approved financial extractions as soon as they exist.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Seller approval — one-tap approval state + link
// ---------------------------------------------------------------------------
export function SellerApprovalCard({ listingId, sellerApproved, approvalRef }: { listingId: string; sellerApproved?: boolean; approvalRef?: string | null }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>👆 Seller approval</div>
      {sellerApproved ? (
        <div style={{ fontSize: 12.5, color: '#166534', fontWeight: 700 }}>
          ✅ Seller approved{approvalRef ? ` · ${approvalRef}` : ''}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: '#9a6700', lineHeight: 1.6 }}>
          ⏳ Waiting on seller approval of the public preview before publish.
          <div style={{ marginTop: 8 }}>
            <a href={`/dashboard/portal`} style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 8, background: '#0e7490', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 12 }}>
              📧 Send / manage seller link
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deal pulse — live heartbeat via the readiness engine
// ---------------------------------------------------------------------------
export function DealPulseCard({ listingId }: { listingId: string }) {
  const [blocking, setBlocking] = useState<string[]>([])
  const [label, setLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/intelligence/readiness?listingId=${encodeURIComponent(listingId)}&action=blocking`, { headers: authHeaders() })
        const j = await res.json()
        if (cancelled) return
        setBlocking(Array.isArray(j.blockers) ? j.blockers.slice(0, 4) : [])
        setLabel(j.label || j.summary || '')
      } catch {
        if (!cancelled) { setBlocking([]); setLabel('') }
      }
    })()
    return () => { cancelled = true }
  }, [listingId])

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>📈 Deal pulse</div>
      {label && <div style={{ fontSize: 12.5, color: 'var(--navy)', fontWeight: 700, marginBottom: 6 }}>{label}</div>}
      {blocking.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {blocking.map((b) => <div key={b} style={{ fontSize: 12, color: '#b45309' }}>⚠ {b}</div>)}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>✓ No blockers — deal is moving</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Risk card — standing red-flag summary during Verify
// ---------------------------------------------------------------------------
export function RiskCard({ listingId }: { listingId: string }) {
  const [risks, setRisks] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/intelligence/readiness?listingId=${encodeURIComponent(listingId)}&action=blocking`, { headers: authHeaders() })
        const j = await res.json()
        if (cancelled) return
        setRisks(Array.isArray(j.blockers) ? j.blockers.slice(0, 5) : [])
      } catch {
        if (!cancelled) setRisks([])
      }
    })()
    return () => { cancelled = true }
  }, [listingId])

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>⚠️ Risk check</div>
      {risks.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {risks.map((r) => <div key={r} style={{ fontSize: 12, color: '#b91c1c' }}>• {r}</div>)}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>✓ No red flags detected</div>
      )}
    </div>
  )
}
