/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/authToken'
import { fetchListingReadiness, type ReadinessResult } from '@/lib/listingReadiness'

// =============================================================================
// GoLiveCard — "What's left before Go Live".
// Replaces the 10-step gauntlet with ONE card: a live score + only the real
// blockers. When nothing blocks, the broker just hits "Go Live".
// =============================================================================

export default function GoLiveCard({ listingId, onGoLive }: { listingId: string; onGoLive?: () => void }) {
  const [r, setR] = useState<ReadinessResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setR(await fetchListingReadiness(listingId))
    setLoading(false)
  }, [listingId])

  useEffect(() => { load() }, [load])

  const goLive = async () => {
    if (publishing) return
    setPublishing(true)
    setPublishMsg(null)
    try {
      const res = await fetch('/api/listings/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ listingId, force: false }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) {
        setPublishMsg(j.error || 'Publish failed — fix the blockers above or force publish.')
      } else {
        setPublishMsg('✅ Live on the marketplace!')
        onGoLive?.()
      }
    } catch {
      setPublishMsg('Publish failed — try again.')
    } finally {
      setPublishing(false)
    }
  }

  const score = r?.score ?? 0
  const blockers = (r?.blockers || []).slice(0, 4)
  const ready = !!r?.canPublish
  const scoreColor = score >= 90 ? '#16a34a' : score >= 75 ? '#c9a84c' : score >= 55 ? '#f97316' : '#dc2626'

  return (
    <div style={{ background: 'linear-gradient(135deg,#0f1023,#14294f)', color: '#fff', borderRadius: 14, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', border: `3px solid ${scoreColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: scoreColor }}>{loading ? '…' : score}</span>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 800, fontFamily: 'Georgia, serif' }}>What's left before Go Live</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
            {loading ? 'Checking…' : ready ? 'Everything looks ready — publish when you are.' : `${blockers.length} thing${blockers.length === 1 ? '' : 's'} to fix`}
          </div>
        </div>
        <button
          onClick={goLive}
          disabled={publishing || !ready}
          style={{
            padding: '11px 22px', borderRadius: 10, border: 'none', cursor: publishing ? 'wait' : ready ? 'pointer' : 'not-allowed',
            background: ready ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'rgba(255,255,255,0.12)',
            color: ready ? '#fff' : 'rgba(255,255,255,0.4)', fontWeight: 800, fontSize: 13.5, fontFamily: 'Georgia, serif',
          }}
        >
          {publishing ? 'Publishing…' : '🚀 Go Live'}
        </button>
      </div>

      {blockers.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {blockers.map((b) => (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px' }}>
              <span style={{ color: '#f97316' }}>🔴</span> {b}
            </div>
          ))}
        </div>
      )}

      {publishMsg && (
        <div style={{ marginTop: 12, fontSize: 12.5, padding: '8px 12px', borderRadius: 8, background: publishMsg.startsWith('✅') ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.12)', border: `1px solid ${publishMsg.startsWith('✅') ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.35)'}`, color: publishMsg.startsWith('✅') ? '#bbf7d0' : '#fca5a5' }}>
          {publishMsg}
        </div>
      )}
    </div>
  )
}
