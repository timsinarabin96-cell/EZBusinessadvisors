/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// RecentlyViewed — cookie/localStorage strip on the marketplace.
// Brings buyers back to listings they already looked at (max 8, no account).
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { proxiedStockUrl } from '@/lib/stockImages'

interface RecentEntry {
  id: string
  title: string
  price: number | null
  industry: string | null
  image: string | null
  slug: string
  at: number
}

const fmt$ = (n: number | null | undefined) => (n == null ? null : '$' + n.toLocaleString('en-US'))

export default function RecentlyViewed() {
  const [items, setItems] = useState<RecentEntry[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('concord-recent')
      const list = raw ? (JSON.parse(raw) as RecentEntry[]) : []
      setItems(list.slice(0, 8))
    } catch { /* ignore */ }
  }, [])

  if (items.length === 0) return null

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16 }}>🕘</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#1a1a2e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Recently viewed
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/marketplace/listings/${item.slug}`}
            style={{ textDecoration: 'none', display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 10, transition: 'box-shadow .15s ease' }}
          >
            <div style={{ width: 44, height: 44, flex: '0 0 44px', borderRadius: 8, overflow: 'hidden', background: '#1a1a2e', display: 'grid', placeItems: 'center', fontSize: 18 }}>
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxiedStockUrl(item.image) ?? item.image} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              ) : (
                <span style={{ color: 'rgba(201,168,76,0.6)', fontSize: 16, fontWeight: 800 }}>{(item.industry || 'B').slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.title}
              </div>
              <div style={{ fontSize: 12, color: '#0e7490', fontWeight: 800 }}>{fmt$(item.price) || 'Upon Request'}</div>
              {item.industry && <div style={{ fontSize: 11, color: '#999' }}>{item.industry}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
