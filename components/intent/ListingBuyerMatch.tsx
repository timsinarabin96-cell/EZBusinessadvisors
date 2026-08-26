/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { getStoredAccessToken } from '@/lib/authToken'

// =============================================================================
// ListingBuyerMatch — the Part D #3 linkage: Visitor Intent → buyer leads.
// Every listing on the intent page gets a "Match buyers" action that scores
// the listing against the agency's buyer profiles (zero-token engine) and
// shows the ranked buyers inline — so brokers see the PEOPLE behind the views.
// =============================================================================

interface Buyer {
  buyerId: string
  name: string | null
  email: string | null
  phone: string | null
  score: number
  reasons: string[]
}

export default function ListingBuyerMatch({ listingId, businessName }: { listingId: string; businessName?: string | null }) {
  const [open, setOpen] = useState(false)
  const [buyers, setBuyers] = useState<Buyer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    setError('')
    const token = getStoredAccessToken()
    try {
      const res = await fetch(`/api/deals/buyer-scorecards?listingId=${encodeURIComponent(listingId)}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!data.ok) { setError(data.error || 'Could not load matches'); setBuyers([]) }
      else setBuyers(data.scorecards || [])
    } catch {
      setError('Could not load matches')
      setBuyers([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={load}
        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', color: 'var(--navy)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
      >
        {open ? '− Hide buyers' : '🎯 Match buyers'}
      </button>

      {open && (
        <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #eef2f7' }}>
          {loading ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Scoring buyers for {businessName || 'this listing'}…</div>
          ) : error ? (
            <div style={{ fontSize: 12.5, color: '#b91c1c' }}>{error}</div>
          ) : buyers.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              No active buyer profiles match this listing yet.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                {buyers.length} buyer{buyers.length === 1 ? '' : 's'} fit this listing
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {buyers.map((b) => (
                  <div key={b.buyerId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ minWidth: 34, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, background: b.score >= 75 ? '#ecfdf5' : b.score >= 55 ? '#fffbeb' : '#f1f5f9', color: b.score >= 75 ? '#15803d' : b.score >= 55 ? '#b45309' : '#64748b' }}>
                      {b.score}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.name || 'Buyer'}
                    </span>
                    {b.email && (
                      <a href={`mailto:${b.email}?subject=Business opportunity matching your criteria`} style={{ fontSize: 12, color: 'var(--navy)', textDecoration: 'none', fontWeight: 700 }} title={`Email ${b.email}`}>✉️</a>
                    )}
                    {b.phone && (
                      <a href={`tel:${b.phone}`} style={{ fontSize: 12, color: 'var(--navy)', textDecoration: 'none', fontWeight: 700 }} title={`Call ${b.phone}`}>📞</a>
                    )}
                  </div>
                ))}
              </div>
              <a href="/dashboard/leads" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                → Open Lead Management
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
