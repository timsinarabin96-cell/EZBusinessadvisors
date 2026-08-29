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

export function ActivityPanel() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [kindFilter, setKindFilter] = useState('all')

  const load = useCallback(async () => {
    const ctx = await getAgencyContext()
    if (!ctx) { setLoading(false); return }
    const token = getStoredAccessToken()
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

  const kinds = Array.from(new Set(items.map((i) => i.kind).filter(Boolean))) as string[]
  const visible = kindFilter === 'all' ? items : items.filter((i) => i.kind === kindFilter)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📋 Activity Feed</h1>
        <p className="text-gray-500 text-sm mt-1">Every deal action across reviews, data rooms, matches, NDAs, and closing milestones.</p>
      </div>

      {/* Entity filter chips */}
      {kinds.length > 1 && (
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
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No activity{items.length ? ' matches this filter' : ' yet'}.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {visible.map((item) => (
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
