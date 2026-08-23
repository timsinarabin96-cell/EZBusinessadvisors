'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { getAgencyContext } from '@/lib/agencyContext'

interface ActivityItem {
  id: string
  kind: string
  title: string
  detail: string
  createdAt: string
  listingName?: string | null
  actor?: string | null
}

const KIND_ICONS: Record<string, string> = {
  review: '🗂️',
  'data-room': '📁',
  match: '🎯',
  nda: '🛡️',
  milestone: '🏁',
}

const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function ActivityPage() {
  return (
    <AppShell active="Activity Feed">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
        <ActivityFeed />
      </div>
    </AppShell>
  )
}

function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const ctx = await getAgencyContext()
    if (!ctx) { setLoading(false); return }
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch(`/api/activity?agencyId=${ctx.agencyId}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setItems(data.items || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📋 Activity Feed</h1>
        <p className="text-gray-500 text-sm mt-1">Every deal action across reviews, data rooms, matches, NDAs, and closing milestones.</p>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No activity yet.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {items.map((item) => (
            <div key={item.id} className="p-4 flex items-start gap-3">
              <span className="text-xl shrink-0">{KIND_ICONS[item.kind] || '•'}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-gray-500">
                  {item.listingName && <span className="font-medium text-gray-700">{item.listingName} · </span>}
                  {item.detail}
                </p>
              </div>
              <span className="ml-auto text-xs text-gray-400 shrink-0">{fmtTime(item.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
