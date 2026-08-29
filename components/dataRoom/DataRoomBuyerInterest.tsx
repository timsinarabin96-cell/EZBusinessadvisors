/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { fetchRoom } from '@/lib/dataRoom'

// =============================================================================
// DataRoomBuyerInterest — "who viewed what" panel for the broker.
// -----------------------------------------------------------------------------
// Reads the data room's view/download logs (already recorded when buyers open
// docs in the portal) and surfaces buyer intent: which email opened/downloaded
// which financial doc, how many docs, recency-weighted score. Broker/admin
// only — the API enforces agency management.
// =============================================================================

interface BuyerRow {
  email: string
  views: number
  downloads: number
  distinctDocs: number
  categories: Record<string, number>
  lastActiveAt: string | null
  score: number
}

interface TopDoc {
  fileId: string
  fileName: string
  fileKind: string | null
  views: number
  downloads: number
  lastViewedAt: string | null
}

interface IntentData {
  roomId: string
  totalViews: number
  totalDownloads: number
  activeBuyers: number
  buyers: BuyerRow[]
  topDocs: TopDoc[]
}

const timeAgo = (iso: string | null) => {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

const scoreColor = (s: number) => (s >= 60 ? '#15803d' : s >= 30 ? '#b45309' : '#64748b')
const KIND_ICON: Record<string, string> = { pdf: '📕', excel: '📊', word: '📝', image: '🖼️', video: '🎬', other: '📄' }

export default function DataRoomBuyerInterest({ dealId }: { dealId: string }) {
  const [intent, setIntent] = useState<IntentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        // Resolve the room id from the deal, then fetch the intent rollup.
        const snap = await fetchRoom(dealId)
        if (!snap.ok || !snap.room) { setLoading(false); return }
        const res = await fetch(`/api/data-rooms/intent?roomId=${encodeURIComponent(snap.room.id)}`, { cache: 'no-store' })
        const j = await res.json()
        if (j.ok && j.intent) setIntent(j.intent)
        else if (!res.ok && res.status === 403) setError('')
        else setError(j.error || 'Could not load buyer interest')
      } catch {
        /* degrade silently */
      } finally {
        setLoading(false)
      }
    })()
  }, [dealId])

  if (loading) return <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Loading buyer interest…</div>
  if (error) return null
  if (!intent) return null

  const sortedBuyers = [...intent.buyers].sort((a, b) => b.score - a.score)

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <div style={{ padding: '14px 18px', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>📊 Buyer Interest</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Georgia, serif' }}>Who viewed what in this data room</div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>
          <span><strong style={{ color: '#fff' }}>{intent.activeBuyers}</strong> active buyers</span>
          <span><strong style={{ color: '#fff' }}>{intent.totalViews}</strong> views</span>
          <span><strong style={{ color: '#fff' }}>{intent.totalDownloads}</strong> downloads</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 0 }}>
        {/* Buyers */}
        <div style={{ borderRight: '1px solid var(--line)', minWidth: 0 }}>
          <div style={{ padding: '10px 18px', fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--line)' }}>
            Buyers by intent score
          </div>
          {sortedBuyers.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>
              No buyer activity yet — when buyers open docs from the portal, their interest shows here.
            </div>
          ) : (
            sortedBuyers.map((b) => (
              <div key={b.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.email}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    {b.views} views · {b.downloads} downloads · {b.distinctDocs} docs · last {timeAgo(b.lastActiveAt)}
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Georgia, serif', color: scoreColor(b.score) }}>{b.score}</div>
              </div>
            ))
          )}
        </div>

        {/* Top docs */}
        <div style={{ minWidth: 0 }}>
          <div style={{ padding: '10px 18px', fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--line)' }}>
            Most-viewed documents
          </div>
          {intent.topDocs.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>No document views logged yet.</div>
          ) : (
            intent.topDocs.slice(0, 6).map((d) => (
              <div key={d.fileId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 16 }}>{KIND_ICON[d.fileKind || 'other'] || '📄'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.fileName}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{d.views} views · {d.downloads} downloads · last {timeAgo(d.lastViewedAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
