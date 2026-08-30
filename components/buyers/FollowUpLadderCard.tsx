/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

// =============================================================================
// FollowUpLadderCard — no-reply escalation ladder + AI composer (studio rail).
// -----------------------------------------------------------------------------
// Shows silent leads with their due ladder step (Day 1/3/7/14). One tap drafts
// a personalized AI follow-up from the lead's record for broker approval —
// nothing sends without a human tap.
// =============================================================================

export default function FollowUpLadderCard() {
  const toast = useToast()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [drafting, setDrafting] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authenticatedFetch('/api/followups/ladder?days=7', { headers: {} })
      const j = await res.json()
      setItems(Array.isArray(j.items) ? j.items.slice(0, 6) : [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const compose = async (it: any) => {
    setDrafting(it.lead_id)
    try {
      const res = await authenticatedFetch('/api/followups/ladder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',  },
        body: JSON.stringify({
          kind: it.kind,
          leadId: it.lead_id,
          name: it.name,
          phone: it.phone,
          stage: it.status,
          ladderDay: it.ladderStep?.day,
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Compose failed')
      setDrafts((d) => ({ ...d, [it.lead_id]: j.draft || '' }))
      toast('✍️ AI draft ready — review and send', 'success')
    } catch (e: any) {
      toast(e.message || 'Compose failed', 'error')
    } finally {
      setDrafting(null)
    }
  }

  const channelIcon: Record<string, string> = { email: '📧', sms: '💬', call: '📞', email_final: '📧' }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 4 }}>🔁 No-reply ladder</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
        Silent leads, auto-escalated: Day 1 email → Day 3 nudge → Day 7 call task → Day 14 final.
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Scanning for silent leads…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nothing due — every lead has replied or been touched. 🎉</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it) => (
            <div key={it.lead_id} style={{ border: '1px solid #e7edf4', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ fontSize: 14 }}>{it.kind === 'buyer' ? '🤝' : '🏢'}</span>
                <span style={{ fontWeight: 800, color: 'var(--navy)', flex: 1 }}>{it.name || 'Lead'}</span>
                {it.ladderStep && (
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: it.ladderStep.day >= 7 ? '#fef2f2' : '#fffbeb', color: it.ladderStep.day >= 7 ? '#b91c1c' : '#9a6700' }}>
                    {channelIcon[it.ladderStep.channel]} Day {it.ladderStep.day}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{it.days_since}d silent</span>
              </div>
              {!drafts[it.lead_id] ? (
                <button
                  onClick={() => compose(it)}
                  disabled={drafting === it.lead_id}
                  style={{ width: '100%', marginTop: 8, padding: '8px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12, cursor: drafting === it.lead_id ? 'wait' : 'pointer' }}
                >
                  {drafting === it.lead_id ? '✍️ Drafting…' : '✍️ AI-draft follow-up'}
                </button>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    value={drafts[it.lead_id]}
                    onChange={(e) => setDrafts((d) => ({ ...d, [it.lead_id]: e.target.value }))}
                    rows={3}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8, border: '1px solid #d8dee6', fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>
                    You approve before anything sends. Copy it into your channel of choice — the draft is yours.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
