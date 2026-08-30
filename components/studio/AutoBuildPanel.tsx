/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { authHeaders } from '@/lib/authToken'

// =============================================================================
// AutoBuildPanel — ONE-CLICK deal builder.
// The broker pastes notes / uploads docs in Capture, then hits one button and
// the system fills the record, reads financials, recasts, generates BOV/CIM/
// BLI, checks SBA, and updates the workflow — with a live progress trail.
// =============================================================================

export interface BuildStep {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  note?: string
}

export default function AutoBuildPanel({ listingId, onBuilt }: { listingId: string; onBuilt?: () => void }) {
  const [building, setBuilding] = useState(false)
  const [steps, setSteps] = useState<BuildStep[]>([])
  const [result, setResult] = useState<{ ok: boolean; notes: string[]; failed: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (building) return
    setBuilding(true)
    setError(null)
    setResult(null)
    setSteps([
      { key: 'record', label: 'Filling the deal record', status: 'pending' },
      { key: 'docs', label: 'Reading your financial documents', status: 'pending' },
      { key: 'docs_gen', label: 'Generating Recast, BOV, CIM & BLI', status: 'pending' },
      { key: 'sba', label: 'SBA eligibility check', status: 'pending' },
      { key: 'workflow', label: 'Updating the workflow checklist', status: 'pending' },
    ])
    try {
      const res = await fetch('/api/listings/auto-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ listingId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        setError(j.error || 'Auto-build failed')
      } else {
        if (Array.isArray(j.steps)) setSteps(j.steps)
        setResult({ ok: j.ok, notes: j.notes || [], failed: j.failed || 0 })
        onBuilt?.()
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setBuilding(false)
    }
  }

  const icon = (s: BuildStep) => {
    switch (s.status) {
      case 'running': return '⏳'
      case 'done': return '✅'
      case 'skipped': return '⏭️'
      case 'failed': return '❌'
      default: return '○'
    }
  }

  const allDone = result?.ok
  const anyFailed = steps.some((s) => s.status === 'failed')

  return (
    <div style={{ background: 'linear-gradient(135deg,#0f1023,#1a1a2e)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 20 }}>⚡</span>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#f5d97a', fontFamily: 'Georgia, serif' }}>Auto-Build Deal</div>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, marginBottom: 12 }}>
        One click — the system fills the record, reads your financials, recasts, generates BOV/CIM/BLI, checks SBA, and updates the checklist. You just review and go live.
      </div>

      <button
        onClick={run}
        disabled={building}
        style={{
          width: '100%', padding: '13px', borderRadius: 10, border: 'none', cursor: building ? 'wait' : 'pointer',
          background: building ? '#555' : 'linear-gradient(135deg,#c9a84c,#b08d2e)', color: '#0f1023',
          fontWeight: 800, fontSize: 14.5, fontFamily: 'Georgia, serif', letterSpacing: '0.02em',
          boxShadow: building ? 'none' : '0 8px 24px rgba(201,168,76,0.35)',
        }}
      >
        {building ? '⏳ Building your deal…' : '⚡ Auto-Build Deal'}
      </button>

      {error && <div style={{ marginTop: 10, fontSize: 12.5, color: '#fca5a5', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>}

      {steps.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {steps.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ width: 18, textAlign: 'center' }}>{icon(s)}</span>
              <span style={{ color: s.status === 'failed' ? '#fca5a5' : s.status === 'done' ? '#bbf7d0' : s.status === 'skipped' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)', fontWeight: s.status === 'running' ? 800 : 600 }}>
                {s.label}
              </span>
              {s.note && <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.5)', fontSize: 11.5, textAlign: 'right' }}>{s.note}</span>}
            </div>
          ))}
        </div>
      )}

      {allDone && !anyFailed && (
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.4)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#bbf7d0' }}>🎉 Deal built — ready for review</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>Review the generated documents, then go live.</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <Link href={`/dashboard/listings/${listingId}/workflow`} style={{ background: '#16a34a', color: '#fff', padding: '9px 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 800, textDecoration: 'none' }}>
              Review workflow →
            </Link>
            <Link href={`/dashboard/listings/${listingId}/edit`} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', padding: '9px 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
              Edit listing
            </Link>
          </div>
        </div>
      )}

      {anyFailed && (
        <div style={{ marginTop: 14, fontSize: 12, color: '#fca5a5', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)', borderRadius: 8, padding: '8px 12px' }}>
          Some steps were skipped or failed — the listing is still usable. Review the notes above and fix the flagged items manually.
        </div>
      )}
    </div>
  )
}
