/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// PublishPanel — pre-publish quality gate + publish/schedule actions.
// Shows readiness score, blocks publish below 70, lists missing items, and
// fires the full publish blast on success (buyer alerts, emails, BBS, etc).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'

interface Readiness { score: number; label: string; missing: string[] }

export default function PublishPanel({ listingId, businessName }: { listingId: string; businessName?: string | null }) {
  const toast = useToast()
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [busy, setBusy] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [published, setPublished] = useState(false)

  const loadReadiness = useCallback(async () => {
    try {
      const res = await fetch(`/api/listings/readiness?listingId=${listingId}`)
      const j = await res.json()
      if (j.ok) setReadiness({ score: j.score, label: j.label, missing: j.missing || [] })
    } catch { /* degrade */ }
  }, [listingId])

  useEffect(() => { loadReadiness() }, [loadReadiness])

  const publish = async (scheduled?: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/listings/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduled ? { listingId, scheduleAt: scheduled } : { listingId }),
      })
      const j = await res.json()
      if (j.ok && j.published) {
        toast(`${businessName || 'Listing'} is live on the marketplace 🚀`, 'success')
        setPublished(true)
      } else if (j.ok && j.scheduled) {
        toast(`Scheduled to go live ${new Date(j.publishAt).toLocaleString()}`, 'success')
      } else if (j.blocked) {
        setReadiness({ score: j.score, label: 'Below publish threshold', missing: j.missing || [] })
        toast(j.error || 'Listing needs more work before publishing', 'error')
      } else {
        toast(j.error || 'Publish failed', 'error')
      }
      loadReadiness()
    } catch (e: any) { toast(e.message || 'Publish failed', 'error') } finally { setBusy(false) }
  }

  const score = readiness?.score ?? null
  const canPublish = score !== null && score >= 70

  return (
    <div style={{ background: 'linear-gradient(135deg,#1a1a2e 0%,#0f3460 100%)', color: '#fff', borderRadius: 14, padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>🚀</span>
        <span style={{ fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 16 }}>Publish to Marketplace</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', marginBottom: 14 }}>
        {published
          ? 'This listing is live on the public marketplace.'
          : 'Run the quality gate, then send it live — buyer alerts, seller emails, and syndication fire automatically.'}
      </div>

      {/* Readiness meter */}
      {score !== null && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Readiness</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444' }}>
              {score}/100 · {readiness?.label}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${score}%`, background: score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444', borderRadius: 99 }} />
          </div>
        </div>
      )}

      {/* Missing items */}
      {readiness && readiness.missing.length > 0 && !published && (
        <div style={{ marginBottom: 14, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fca5a5', marginBottom: 6 }}>Missing before publish:</div>
          {readiness.missing.slice(0, 6).map((m) => (
            <div key={m} style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', padding: '2px 0' }}>• {m}</div>
          ))}
        </div>
      )}

      {/* Actions */}
      {!published && (
        <>
          <button
            onClick={() => publish()}
            disabled={busy || !canPublish}
            style={{
              width: '100%', padding: '13px', borderRadius: 8, cursor: busy || !canPublish ? 'not-allowed' : 'pointer',
              background: canPublish ? '#c9a84c' : 'rgba(255,255,255,0.15)', color: canPublish ? '#1a1a2e' : 'rgba(255,255,255,0.5)',
              border: 'none', fontWeight: 800, fontFamily: 'Georgia, serif', opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Publishing…' : canPublish ? 'Publish Now 🚀' : 'Publish Blocked — Complete Fields Above'}
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }} />
            <button onClick={() => scheduleAt && publish(scheduleAt)} disabled={busy || !scheduleAt} style={{ padding: '10px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontWeight: 700, cursor: busy || !scheduleAt ? 'not-allowed' : 'pointer', fontSize: 12.5 }}>
              Schedule
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 10, textAlign: 'center' }}>
            Publishing fires buyer-match alerts, seller/team emails, and the newspaper queue. Syndication to external sources is manual — you enter BizBuySell/LoopNet etc. yourself.
          </div>
        </>
      )}
    </div>
  )
}
