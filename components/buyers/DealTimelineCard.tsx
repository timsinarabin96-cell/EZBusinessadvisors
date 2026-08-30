/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

// =============================================================================
// DealTimelineCard — the unified deal timeline (Wave D).
// -----------------------------------------------------------------------------
// Every touchpoint in one chronological stream: pipeline stage changes,
// communications, offers, data-room views, files. The single source of truth
// for "what happened on this deal" — no more hunting across tabs.
// =============================================================================

export default function DealTimelineCard({ listingId }: { listingId: string }) {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authenticatedFetch(`/api/deals/timeline?listingId=${encodeURIComponent(listingId)}`, { headers: {} })
        const j = await res.json()
        if (!cancelled && j.ok) setEvents(Array.isArray(j.events) ? j.events : [])
      } catch { if (!cancelled) setEvents([]) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [listingId])

  const iconFor = (kind: string) => {
    const map: Record<string, string> = {
      pipeline: '🔄', communication: '💬', offer: '🤝', data_room: '📁', file: '📎', loi: '📝', closing: '🏁', system: '⚙️',
    }
    return map[kind] || '•'
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>🕘 Deal timeline</div>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>No activity yet — stage moves, calls, emails, and offers will land here automatically.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 320, overflowY: 'auto' }}>
          {events.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < events.length - 1 ? '1px solid #f3f5f8' : 'none' }}>
              <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{iconFor(e.kind)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 700, lineHeight: 1.45 }}>{e.title}</div>
                {e.detail && <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 2 }}>{e.detail}</div>}
              </div>
              <span style={{ fontSize: 10.5, color: '#9aa4b2', whiteSpace: 'nowrap', paddingTop: 2 }}>{new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
