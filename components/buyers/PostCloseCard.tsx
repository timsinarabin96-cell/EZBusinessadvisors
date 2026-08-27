/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authHeaders } from '@/lib/authToken'

// =============================================================================
// PostCloseCard — the golden-referral engine in the studio.
// -----------------------------------------------------------------------------
// Lists due check-ins for the agency (90-day seller check-in, referral ask,
// testimonial ask, yearly valuation refresh). One tap marks sent/replied;
// converted links to a brand-new listing. Works with the /api/post-close API.
// =============================================================================

const TYPE_LABEL: Record<string, { icon: string; label: string }> = {
  day90: { icon: '📅', label: '90-day check-in' },
  referral_ask: { icon: '🤝', label: 'Referral ask' },
  testimonial_ask: { icon: '⭐', label: 'Testimonial ask' },
  yearly_valuation: { icon: '📈', label: 'Yearly valuation refresh' },
}

export default function PostCloseCard() {
  const toast = useToast()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/post-close', { headers: authHeaders() })
      const j = await res.json()
      setItems(Array.isArray(j.items) ? j.items.slice(0, 6) : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const setStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/post-close', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ checkinId: id, status }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Update failed')
      toast(`Marked ${status}`, 'success')
      load()
    } catch (e: any) {
      toast(e.message || 'Update failed', 'error')
    }
  }

  const due = items.filter((i) => i.status === 'scheduled')
  const sent = items.filter((i) => i.status !== 'scheduled')

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 4 }}>💎 Golden referrals</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
        Closed deals auto-schedule check-ins: 90-day seller touch → referral ask → testimonial → yearly valuation. Past clients = your cheapest pipeline.
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>No check-ins yet. Close a deal and the sequence schedules itself. 🎉</div>
      ) : (
        <>
          {due.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {due.map((it) => {
                const meta = TYPE_LABEL[it.checkin_type] || { icon: '📌', label: it.checkin_type }
                return (
                  <div key={it.id} style={{ border: '1px solid #e7edf4', borderRadius: 10, padding: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                      <span>{meta.icon}</span>
                      <span style={{ fontWeight: 800, color: 'var(--navy)', flex: 1 }}>{meta.label}</span>
                      <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>due {new Date(it.due_at).toLocaleDateString()}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                      {it.seller_name || it.buyer_name || 'Client'}
                      {it.seller_email || it.buyer_email ? ` · ${it.seller_email || it.buyer_email}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button onClick={() => setStatus(it.id, 'sent')} style={chip('#0e7490')}>📧 Mark sent</button>
                      <button onClick={() => setStatus(it.id, 'replied')} style={chip('#166534')}>💬 Replied</button>
                      <button onClick={() => setStatus(it.id, 'skipped')} style={chip('#6b7280')}>Skip</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {sent.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
              +{sent.length} already handled
            </div>
          )}
        </>
      )}
    </div>
  )
}

const chip = (c: string): React.CSSProperties => ({
  padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 700, fontSize: 11.5, fontFamily: 'inherit',
  background: 'transparent', color: c, border: `1px solid ${c}`,
})
