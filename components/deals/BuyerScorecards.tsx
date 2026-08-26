/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { getStoredAccessToken } from '@/lib/authToken'

// =============================================================================
// BuyerScorecards — who to call first, right in the deal drawer.
// Scores the deal's listing against the agency's active buyer profiles using
// the zero-token match engine (industry / location / price / revenue / SDE).
// Ranked scorecards with fit reasons + one-click contact actions.
// =============================================================================

interface Scorecard {
  buyerId: string
  name: string | null
  email: string | null
  phone: string | null
  industries: string[]
  locations: string[]
  score: number
  reasons: string[]
}

const REASON_LABELS: Record<string, string> = {
  industry: '🏭 Industry',
  location: '📍 Location',
  price: '💰 Budget',
  revenue: '📈 Revenue',
  sde: '💵 Earnings',
}

const scoreColor = (s: number) => (s >= 75 ? '#15803d' : s >= 55 ? '#b45309' : '#64748b')
const scoreBg = (s: number) => (s >= 75 ? '#ecfdf5' : s >= 55 ? '#fffbeb' : '#f1f5f9')

export default function BuyerScorecards({ listingId }: { listingId: string | null }) {
  const [cards, setCards] = useState<Scorecard[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!listingId) { setCards([]); return }
    let mounted = true
    setLoading(true)
    setError('')
    const token = getStoredAccessToken()
    fetch(`/api/deals/buyer-scorecards?listingId=${encodeURIComponent(listingId)}`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (!mounted) return
        if (d.ok) setCards(d.scorecards || [])
        else setError(d.error || 'Could not load buyer scorecards')
      })
      .catch(() => { if (mounted) setError('Could not load buyer scorecards') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [listingId])

  if (!listingId) return null

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>🎯</span>
        <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 14 }}>Buyer scorecards</span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 4 }}>
          {loading ? 'scoring…' : cards.length ? `${cards.length} fit this listing` : 'no active buyer profiles match'}
        </span>
      </div>

      {error && <div style={{ fontSize: 12.5, color: '#b91c1c', marginBottom: 8 }}>{error}</div>}

      {cards.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cards.map((c) => (
            <div key={c.buyerId} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    minWidth: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 15, background: scoreBg(c.score), color: scoreColor(c.score),
                  }}
                >
                  {c.score}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.name || 'Buyer'}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {c.reasons.map((r) => (
                      <span key={r} style={{ whiteSpace: 'nowrap' }}>{REASON_LABELS[r] || r}</span>
                    ))}
                    {c.industries.length > 0 && <span style={{ whiteSpace: 'nowrap' }}>· {c.industries.slice(0, 2).join(', ')}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {c.email && (
                    <a
                      href={`mailto:${c.email}?subject=Business opportunity matching your criteria`}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 11.5, fontWeight: 700, color: 'var(--navy)', textDecoration: 'none', background: '#faf9f4' }}
                    >
                      ✉️
                    </a>
                  )}
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 11.5, fontWeight: 700, color: 'var(--navy)', textDecoration: 'none', background: '#faf9f4' }}
                    >
                      📞
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
