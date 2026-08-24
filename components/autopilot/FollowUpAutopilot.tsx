'use client'

import { useCallback, useEffect, useState } from 'react'
import { getAgencyContext } from '@/lib/agencyContext'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface FollowUpItem {
  kind: 'buyer' | 'seller'
  lead_id: string
  name: string | null
  email: string | null
  phone: string | null
  status: string | null
  last_contacted_at: string | null
  days_since: number
  has_reply: boolean
}

const panel: React.CSSProperties = { background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }
const heading: React.CSSProperties = { margin: '0 0 14px', color: 'var(--navy)', fontFamily: 'Georgia, serif' }

const timeAgo = (iso: string | null) => {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'today'
  return `${days}d ago`
}

export default function FollowUpAutopilot() {
  const toast = useToast()
  const [items, setItems] = useState<FollowUpItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)

  const load = useCallback(async () => {
    const ctx = await getAgencyContext()
    if (!ctx) { setLoading(false); return }
    try {
      const token = localStorage.getItem('sb-access-token') || ''
      const res = await fetch(`/api/autopilot/followups?agencyId=${ctx.agencyId}&days=3`, { headers: { authorization: `Bearer ${token}` } })
      const j = await res.json().catch(() => ({}))
      setItems(j.items || [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const textNow = async (item: FollowUpItem) => {
    if (!item.phone) { toast('No phone number on file', 'error'); return }
    setSending(item.lead_id)
    try {
      const token = localStorage.getItem('sb-access-token') || ''
      const res = await fetch('/api/autopilot/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: item.kind, leadId: item.lead_id, name: item.name, phone: item.phone }),
      })
      const j = await res.json().catch(() => ({}))
      if (!j.ok) throw new Error(j.error || 'Failed')
      toast('✅ Follow-up text sent — logged to timeline', 'success')
      load()
    } catch (err: any) {
      toast(err.message || 'Failed to send', 'error')
    } finally {
      setSending(null)
    }
  }

  const actionable = items.filter((i) => !i.has_reply)

  return (
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ ...heading, margin: 0 }}>Follow-up autopilot</h2>
        <span style={{ fontSize: 12, fontWeight: 800, color: actionable.length ? '#b91c1c' : '#166534', background: actionable.length ? '#fef2f2' : '#f0fdf4', padding: '4px 10px', borderRadius: 999 }}>
          {actionable.length} due
        </span>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0 14px' }}>
        Leads who haven't replied in 3+ days. One tap texts them via the agent and logs it.
      </p>

      {loading ? <LoadingState label="Scanning leads…" /> : actionable.length === 0 ? (
        <div style={{ padding: 18, background: 'var(--cream)', borderRadius: 10, color: 'var(--muted)', fontSize: 13.5 }}>
          🎉 Nothing due — every lead has been contacted or replied. Check back after 3 days of silence.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {actionable.slice(0, 12).map((item) => (
            <div key={`${item.kind}-${item.lead_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
              <span style={{ fontSize: 16 }}>{item.kind === 'buyer' ? '👤' : '🏢'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.name || item.email || 'Unnamed lead'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {item.status} · last contact {timeAgo(item.last_contacted_at)}{item.days_since >= 7 ? ' · ⚠️ stale' : ''}
                </div>
              </div>
              <button
                onClick={() => textNow(item)}
                disabled={sending === item.lead_id || !item.phone}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: item.phone ? '#1d4ed8' : '#d1d5db', color: item.phone ? '#fff' : '#6b7280', fontWeight: 800, fontSize: 12.5, cursor: item.phone ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
              >
                {sending === item.lead_id ? 'Sending…' : item.phone ? '💬 Text now' : 'No phone'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
