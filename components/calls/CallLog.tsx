/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// Call Log — every inbound call, enriched with caller identity.
// Reverse-matches caller numbers against the CRM (buyer/seller leads) so the
// broker sees WHO called and WHICH listing they were calling about, plus the
// callback state so no lead falls through the cracks.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@/components/ui'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

interface CallRow {
  id: string
  provider: string | null
  direction: string | null
  status: string | null
  caller_number: string | null
  destination_number: string | null
  caller_name: string | null
  caller_matched?: boolean
  purpose: string | null
  listing_id: string | null
  summary: string | null
  sentiment: string | null
  qualification_score: number | null
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  transferred_to: string | null
  listings?: { business_name: string | null; listing_ref: string | null } | null
  reminders?: { id: string; title: string; status: string }[] | null
}

const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

const fmtDur = (sec: number | null) => {
  if (sec == null) return '—'
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m ${sec % 60}s`
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#166534', negative: '#b00020', neutral: '#5b6b7c',
}

export default function CallLog() {
  const [calls, setCalls] = useState<CallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [agencyId, setAgencyId] = useState('')

  const load = useCallback(async (agency: string, status: string) => {
    setLoading(true)
    const token = getStoredAccessToken()
    const res = await fetch(`/api/calls?agencyId=${agency}&status=${status}&hours=${24 * 7}`, {
      headers: { authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    setCalls(data.calls || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      setAgencyId(ctx.agencyId)
      await load(ctx.agencyId, filter)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeFilter = async (status: string) => {
    setFilter(status)
    if (agencyId) await load(agencyId, status)
  }

  const statusBadge = (c: CallRow) => {
    const s = c.status || ''
    const map: Record<string, { label: string; color: string; bg: string }> = {
      completed: { label: 'Completed', color: '#166534', bg: '#dcfce7' },
      transferred: { label: 'Transferred', color: '#0e7490', bg: '#cffafe' },
      in_progress: { label: 'Live', color: '#92400e', bg: '#fef3c7' },
      missed: { label: 'Missed', color: '#b00020', bg: '#fee2e2' },
      failed: { label: 'Failed', color: '#b00020', bg: '#fee2e2' },
    }
    const m = map[s] || { label: s, color: '#5b6b7c', bg: '#f1f5f9' }
    return <span style={{ fontSize: 11, fontWeight: 800, color: m.color, background: m.bg, padding: '3px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.04em' }}>{m.label}</span>
  }

  const callback = (c: CallRow) => (c.reminders || []).find((r) => r.status === 'pending')

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', margin: 0 }}>Call Log 📞</h1>
        <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 14, maxWidth: 680 }}>
          Every inbound call with the caller&apos;s identity reverse-matched from your CRM — who called, which listing they were asking about, and whether a callback is due.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'completed', 'missed', 'transferred', 'in_progress'].map((s) => (
          <button
            key={s}
            onClick={() => changeFilter(s)}
            style={{
              padding: '7px 15px', borderRadius: 999, border: '1px solid var(--line)', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: 'Georgia, serif',
              background: filter === s ? 'var(--navy)' : '#fff',
              color: filter === s ? '#fff' : 'var(--navy)',
            }}
          >
            {s === 'all' ? 'All calls' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? <LoadingState /> : calls.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📞</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)' }}>No calls in the last 7 days</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>Inbound calls will appear here with caller identity and listing context.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {calls.map((c) => {
            const cb = callback(c)
            return (
              <div key={c.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 17 }}>{c.caller_matched ? '👤' : '📱'}</span>
                      <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16 }}>
                        {c.caller_name || 'Unknown caller'}
                        {c.caller_matched && <span style={{ fontSize: 11, color: '#0e7490', background: '#cffafe', borderRadius: 999, padding: '2px 8px', marginLeft: 8 }}>in CRM</span>}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, fontFamily: 'monospace' }}>
                      {c.caller_number || 'no number'}
                      {c.destination_number ? ` → ${c.destination_number}` : ''}
                    </div>
                    {c.listings?.business_name && (
                      <div style={{ fontSize: 13, color: '#0e7490', fontWeight: 700, marginTop: 6 }}>
                        🏢 {c.listings.business_name}{c.listings.listing_ref ? ` (${c.listings.listing_ref})` : ''}
                      </div>
                    )}
                    {c.summary && <div style={{ fontSize: 13, color: '#5b6b7c', marginTop: 8, lineHeight: 1.5 }}>{c.summary}</div>}
                  </div>
                  <div style={{ textAlign: 'right', display: 'grid', gap: 6, justifyItems: 'end' }}>
                    {statusBadge(c)}
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{fmtWhen(c.started_at)} · {fmtDur(c.duration_seconds)}</span>
                    {c.sentiment && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: SENTIMENT_COLOR[c.sentiment] || '#5b6b7c', textTransform: 'capitalize' }}>
                        {c.sentiment} {typeof c.qualification_score === 'number' ? `· ${c.qualification_score}/100` : ''}
                      </span>
                    )}
                    {cb ? (
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: '#b45309', background: '#fef3c7', borderRadius: 999, padding: '3px 10px' }}>
                        ⏰ Callback pending: {cb.title.slice(0, 40)}
                      </span>
                    ) : c.status === 'completed' && c.caller_number ? (
                      <span style={{ fontSize: 11.5, color: '#166534' }}>✓ No callback needed</span>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
