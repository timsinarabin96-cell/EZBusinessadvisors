/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// SuggestedBuyersPanel — per-listing buyer suggestions (agency-scoped).
// Fetches matched buyer leads for ANY listing (works for agent-created
// listings too) via /api/listings/suggested-buyers, then lets the broker
// attach / detach a lead to this listing in one click.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

interface SuggestedBuyer {
  id: string
  name: string
  email: string
  phone: string | null
  status: string
  source: string | null
  interests: string
  preferred_location: string | null
  funds_available: number | null
  listing_id: string | null
  attached_to_this: boolean
  score: number
  matched: boolean
  reasons: string[]
}

const statusColor = (s: string) =>
  ({ new: '#3b82f6', qualifying: '#f59e0b', qualified: '#8b5cf6', handed_off: '#22c55e', not_a_fit: '#ef4444' } as Record<string, string>)[s] || '#94a3b8'

export default function SuggestedBuyersPanel({ listingId }: { listingId: string }) {
  const [matches, setMatches] = useState<SuggestedBuyer[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authenticatedFetch(`/api/listings/suggested-buyers?listingId=${encodeURIComponent(listingId)}`)
      const data = await res.json()
      if (res.ok && data.ok) setMatches(data.matches || [])
      else setError(data.error || 'Could not load suggestions')
    } catch {
      setError('Could not load suggestions')
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { load() }, [load])

  const toggleAttach = async (buyer: SuggestedBuyer) => {
    setBusyId(buyer.id)
    try {
      const res = await authenticatedFetch('/api/listings/suggested-buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, leadId: buyer.id, attach: !buyer.attached_to_this }),
      })
      const data = await res.json()
      if (res.ok && data.ok) await load()
      else setError(data.error || 'Update failed')
    } catch {
      setError('Update failed')
    } finally {
      setBusyId(null)
    }
  }

  const matchedCount = matches.filter((m) => m.matched).length

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>🎯 Suggested BizBuySell buyers</div>
        {!loading && (
          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
            {matchedCount} match{matchedCount === 1 ? '' : 'es'} · {matches.length} buyers
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Matching buyer leads…</div>
      ) : error ? (
        <div style={{ fontSize: 12.5, color: '#b91c1c' }}>{error}</div>
      ) : matches.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          No buyer leads on file for this industry yet. Add buyers in <strong>Leads → + Add Lead</strong> (source: BizBuySell) and they'll appear here automatically.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {matches.map((b) => (
            <div key={b.id} style={{ border: b.attached_to_this ? '1px solid #86efac' : '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: b.attached_to_this ? '#f0fdf4' : '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>{b.name}</span>
                    <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, color: '#fff', fontWeight: 700, background: statusColor(b.status) }}>{b.status.replace(/_/g, ' ')}</span>
                    {b.attached_to_this && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#15803d' }}>✓ linked</span>}
                  </div>
                  {b.email && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{b.email}{b.phone ? ` · ${b.phone}` : ''}</div>}
                  {b.interests && <div style={{ fontSize: 11.5, color: 'var(--navy)', marginTop: 3 }}>🔎 {b.interests}</div>}
                  {(b.preferred_location || b.funds_available != null) && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {[b.preferred_location ? `📍 ${b.preferred_location}` : '', b.funds_available != null ? `💵 $${Number(b.funds_available).toLocaleString()}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {b.matched && b.reasons.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {b.reasons.slice(0, 2).map((r, i) => (
                        <span key={i} style={{ fontSize: 11, color: '#15803d' }}>✓ {r}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  {b.matched && <span style={{ fontSize: 11, fontWeight: 800, color: '#0e7490' }}>{b.score}% fit</span>}
                  <button
                    onClick={() => toggleAttach(b)}
                    disabled={busyId === b.id}
                    style={{
                      padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 700,
                      border: b.attached_to_this ? '1px solid #d1d5db' : '1px solid var(--navy)',
                      background: b.attached_to_this ? '#fff' : 'var(--navy)',
                      color: b.attached_to_this ? 'var(--navy)' : '#fff',
                    }}
                  >
                    {busyId === b.id ? '…' : b.attached_to_this ? 'Unlink' : 'Link to this listing'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
