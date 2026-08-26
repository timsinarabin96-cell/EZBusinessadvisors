/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// ListingViewStats — per-listing engagement for the broker (edit page panel).
// Shows total views, unique visitors, repeat lookers, and 7-day activity so
// the broker/seller sees exactly how much traction a listing is getting.
// =============================================================================

import { useEffect, useState } from 'react'
import { fetchIntentForAgency, type ListingIntentStats } from '@/lib/visitorIntent'

export default function ListingViewStats({ listingId }: { listingId: string }) {
  const [stat, setStat] = useState<ListingIntentStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetchIntentForAgency().then((stats) => {
      if (!mounted) return
      setStat(stats.find((s) => s.listingId === listingId) || null)
      setLoading(false)
    })
    return () => { mounted = false }
  }, [listingId])

  if (loading) return <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 4 }}>Loading views…</div>
  if (!stat) return (
    <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 4 }}>
      No views tracked yet — share the listing link to start generating interest.
    </div>
  )

  const items = [
    { label: 'Total views', value: stat.totalViews },
    { label: 'Unique visitors', value: stat.uniqueVisitors },
    { label: 'Repeat lookers', value: stat.repeatViewers },
    { label: 'Views (7 days)', value: stat.viewsLast7d },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
        {items.map((it) => (
          <div key={it.label} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>{it.value}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{it.label}</div>
          </div>
        ))}
      </div>
      {stat.hot && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: '#b45309', fontWeight: 700 }}>
          🔥 Hot listing — 3+ unique visitors in the last 7 days
        </div>
      )}
      {stat.lastViewedAt && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
          Last viewed {new Date(stat.lastViewedAt).toLocaleString()}
        </div>
      )}
    </div>
  )
}
