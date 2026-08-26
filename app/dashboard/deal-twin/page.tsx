/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

interface Snapshot {
  id: string
  agency_id: string
  listing_id: string
  deal_id: string | null
  health_score: number
  risk_flags: string[]
  components: Record<string, number>
  summary: string | null
  computed_at: string
}

const COMPONENT_LABELS: Record<string, string> = {
  dataRoom: 'Data room activity',
  buyers: 'Buyer engagement',
  offers: 'Offer momentum',
  milestones: 'Closing milestones',
  momentum: 'Recent momentum',
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

const scoreColor = (score: number) => (score >= 75 ? 'text-green-600' : score >= 45 ? 'text-amber-600' : 'text-red-600')

export default function DealTwinPage() {
  return (
    <AppShell active="Deal Twin">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <DealTwin />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function DealTwin() {
  const toast = useToast()
  const [listings, setListings] = useState<{ id: string; label: string }[]>([])
  const [selected, setSelected] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadListings = useCallback(async (agencyId: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/listings/options?agencyId=${agencyId}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setListings(data.listings || [])
  }, [])

  const loadSnapshot = useCallback(async (listingId: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/intelligence/deal-twin?listingId=${listingId}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setSnapshot(data.snapshot || null)
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      await loadListings(ctx.agencyId)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectListing = async (id: string) => {
    setSelected(id)
    setLoading(true)
    await loadSnapshot(id)
    setLoading(false)
  }

  // Health history — snapshot scores to localStorage per listing so brokers
  // can see the trend even though the API only stores the latest snapshot.
  const HISTORY_KEY = (id: string) => `deal_twin_history_${id}`
  const [history, setHistory] = useState<{ score: number; at: string; components?: Record<string, number> }[]>([])

  useEffect(() => {
    if (!selected) return
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY(selected))
      setHistory(raw ? JSON.parse(raw) : [])
    } catch { setHistory([]) }
  }, [selected])

  useEffect(() => {
    if (!selected || !snapshot?.health_score) return
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY(selected))
      const list = raw ? JSON.parse(raw) : []
      list.push({ score: snapshot.health_score, at: snapshot.computed_at || new Date().toISOString(), components: snapshot.components })
      window.localStorage.setItem(HISTORY_KEY(selected), JSON.stringify(list.slice(-30)))
      setHistory(list.slice(-30))
    } catch { /* storage unavailable */ }
  }, [selected, snapshot?.health_score])

  // “What changed this week” — compare current component scores vs the
  // earliest snapshot so brokers see which drivers moved.
  const whatChanged = (() => {
    if (history.length < 2 || !snapshot) return []
    const first = history[0]
    const out: { label: string; from: number; to: number }[] = []
    for (const [key, label] of Object.entries(COMPONENT_LABELS)) {
      const from = first.components?.[key]
      const to = snapshot.components?.[key]
      if (typeof from === 'number' && typeof to === 'number' && from !== to) {
        out.push({ label, from, to })
      }
    }
    return out
  })()

  const recompute = async () => {
    if (!selected) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/intelligence/deal-twin', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ listingId: selected }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to compute Deal Twin', 'error')
    setSnapshot(data.snapshot || null)
    toast('Deal Twin refreshed', 'success')
  }

  if (loading && !selected) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🤖 Deal Twin</h1>
        <p className="text-gray-500 text-sm mt-1">
          A live health score per listing — data room activity, buyer engagement, offers, closing milestones, and momentum.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Select a listing</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <select
            className="border rounded-lg px-3 py-2 text-sm flex-1"
            value={selected}
            onChange={(e) => selectListing(e.target.value)}
          >
            <option value="">Choose a listing…</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <button
            onClick={recompute}
            disabled={!selected || busy}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {busy ? 'Computing…' : '↻ Recompute'}
          </button>
        </div>
      </div>

      {!selected ? (
        <p className="text-gray-400 text-sm">Pick a listing to see its Deal Twin snapshot.</p>
      ) : !snapshot ? (
        <p className="text-gray-400 text-sm">No snapshot yet — hit Recompute to score this listing.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Health score */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold mb-2">Health score</h2>
            <p className={`text-5xl font-bold ${scoreColor(snapshot.health_score)}`}>{snapshot.health_score}<span className="text-lg text-gray-400">/100</span></p>
            {snapshot.summary && <p className="text-sm text-gray-600 mt-3">{snapshot.summary}</p>}
            <p className="text-xs text-gray-400 mt-3">Computed {fmtDate(snapshot.computed_at)}</p>
            {history.length >= 2 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Trend</span>
                  <span>
                    {history[0].score} → {history[history.length - 1].score}
                    <span className={scoreColor(history[history.length - 1].score - history[0].score)}>
                      {' '}({history[history.length - 1].score - history[0].score >= 0 ? '+' : ''}{history[history.length - 1].score - history[0].score})
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 44 }}>
                  {history.map((h, i) => (
                    <div
                      key={i}
                      title={`${h.score}/100 · ${fmtDate(h.at)}`}
                      style={{
                        flex: 1, borderRadius: '2px 2px 0 0',
                        height: `${Math.max(4, (h.score / 100) * 40)}px`,
                        background: h.score >= 75 ? '#22c55e' : h.score >= 45 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Component breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold mb-3">Component breakdown</h2>
            <div className="space-y-3">
              {Object.entries(COMPONENT_LABELS).map(([key, label]) => {
                const value = snapshot.components?.[key] ?? 0
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>{label}</span>
                      <span>{value}/100</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${value >= 75 ? 'bg-green-500' : value >= 45 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${Math.min(100, value)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Risk flags */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold mb-3">Risk flags</h2>
            {snapshot.risk_flags.length === 0 ? (
              <p className="text-sm text-green-600">✅ No risk flags — this deal looks healthy.</p>
            ) : (
              <ul className="space-y-2">
                {snapshot.risk_flags.map((flag, i) => (
                  <li key={i} className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    ⚠️ {flag}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
