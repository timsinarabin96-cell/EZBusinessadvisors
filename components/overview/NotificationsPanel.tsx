/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@/components/ui'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

interface NotificationItem {
  id: string
  title: string
  body: string | null
  kind: string
  link: string | null
  read_at: string | null
  created_at: string
}

const KIND_ICONS: Record<string, string> = {
  info: 'ℹ️',
  review: '🗂️',
  nda: '🛡️',
  match: '🎯',
  milestone: '🏁',
  billing: '💳',
  system: '⚙️',
  training: '🎓',
  draft_nudge: '⏸️',
}

const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export function NotificationsPanel() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [kindFilter, setKindFilter] = useState('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [quietHours, setQuietHours] = useState(() => {
    try { return window.localStorage.getItem('concord_quiet_hours') === '1' } catch { return false }
  })

  const load = useCallback(async () => {
    const ctx = await getAgencyContext()
    if (!ctx) { setLoading(false); return }
    const token = getStoredAccessToken()
    const res = await fetch(`/api/notifications?agencyId=${ctx.agencyId}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setItems(data.items || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markAllRead = async () => {
    const ctx = await getAgencyContext()
    if (!ctx) return
    const token = getStoredAccessToken()
    await fetch('/api/notifications', { method: 'PATCH', headers: { authorization: `Bearer ${token}` } })
    await load()
  }

  const [briefBusy, setBriefBusy] = useState(false)
  const sendBrief = async () => {
    const ctx = await getAgencyContext()
    if (!ctx) return
    setBriefBusy(true)
    const token = getStoredAccessToken()
    try {
      const res = await fetch('/api/captains-brief', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ agencyId: ctx.agencyId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        alert(data.error || 'Could not send the brief')
      } else {
        alert(`Captain's Brief sent — ${data.recipients ?? 0} recipient(s)`)
      }
    } finally {
      setBriefBusy(false)
    }
  }

  const sendDaily = async () => {
    const ctx = await getAgencyContext()
    if (!ctx) return
    setBriefBusy(true)
    const token = getStoredAccessToken()
    try {
      const res = await fetch('/api/daily-brief', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ agencyId: ctx.agencyId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        alert(data.error || 'Could not send the daily brief')
      } else {
        alert(`Daily brief sent — ${data.recipients ?? 0} recipient(s)`)
      }
    } finally {
      setBriefBusy(false)
    }
  }

  if (loading) return <LoadingState />

  const kinds = Array.from(new Set(items.map((i) => i.kind).filter(Boolean))) as string[]
  const hour = new Date().getHours()
  const inQuietHours = hour < 8 || hour >= 22
  const visible = items.filter((i) => {
    if (kindFilter !== 'all' && i.kind !== kindFilter) return false
    if (unreadOnly && i.read_at) return false
    if (quietHours && inQuietHours && !i.read_at) return false
    return true
  })
  const unreadCount = items.filter((i) => !i.read_at).length

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🛎️ Notifications</h1>
          <p className="text-gray-500 text-sm mt-1">Platform workflow alerts for your agency.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={sendDaily}
            disabled={briefBusy}
            className="text-sm bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg"
            title="Email the morning 'Today at a Glance' — new leads, NDA signers, expiring listings, deal movement"
          >
            {briefBusy ? 'Sending…' : '☀️ Send daily brief now'}
          </button>
          <button
            onClick={sendBrief}
            disabled={briefBusy}
            className="text-sm bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg"
            title="Email the weekly Captain's Brief to your agency owners/admins — stale deals, expiring listings, new buyers, commissions"
          >
            {briefBusy ? 'Sending…' : '📬 Send Captain\'s Brief now'}
          </button>
          <button onClick={markAllRead} className="text-sm text-blue-600 hover:underline">
            Mark all read{unreadCount ? ` (${unreadCount} unread)` : ''}
          </button>
        </div>
      </div>

      {/* Digest controls — filter by kind + unread */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setKindFilter('all')}
          className={`text-xs px-3 py-1.5 rounded-full border font-medium ${kindFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
        >
          All
        </button>
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(kindFilter === k ? 'all' : k)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium ${kindFilter === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
          >
            {KIND_ICONS[k] || '•'} {k}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer" title="Hide unread alerts between 10pm and 8am">
          <input
            type="checkbox"
            checked={quietHours}
            onChange={(e) => {
              const next = e.target.checked
              setQuietHours(next)
              try { window.localStorage.setItem('concord_quiet_hours', next ? '1' : '0') } catch { /* ignore */ }
            }}
          />
          🌙 Quiet hours{quietHours && inQuietHours ? ' (active now)' : ''}
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No notifications{items.length ? ' match this filter' : ' yet'}.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {visible.map((item) => (
            <div key={item.id} className={`p-4 flex items-start gap-3 ${item.read_at ? '' : 'bg-blue-50/40'}`}>
              <span className="text-xl shrink-0">{KIND_ICONS[item.kind] || '•'}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                {item.body && <p className="text-xs text-gray-500 mt-0.5">{item.body}</p>}
              </div>
              {!item.read_at && <span className="ml-auto mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
              <span className="ml-auto text-xs text-gray-400 shrink-0">{fmtTime(item.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
