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
  readiness_score: number
  components: Record<string, number>
  action_items: string[]
  valuation_estimate: number | null
  updated_at: string
}

interface Funnel {
  totalListings: number
  scored: number
  ready: number
  needsWork: number
  active: number
  inDeal: number
  closed: number
  avgScore: number | null
  topBlockers: { item: string; count: number }[]
}

interface BlockingSummary {
  listingId: string
  score: number
  blockers: string[]
  summary: string
  model: 'deterministic' | 'ai'
}

const COMPONENT_LABELS: Record<string, string> = {
  financials: 'Financial recast',
  cim: 'CIM generated',
  bov: 'BOV generated',
  dataRoom: 'Data room populated',
  price: 'Asking price set',
  approval: 'Seller approval',
  compliance: 'Compliance review',
}

const money = (n: number | null | undefined) => (n != null ? '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—')

export default function ReadinessPage() {
  return (
    <AppShell active="Seller Readiness">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <SellerReadiness />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function SellerReadiness() {
  const toast = useToast()
  const [listings, setListings] = useState<{ id: string; label: string }[]>([])
  const [selected, setSelected] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [summary, setSummary] = useState<BlockingSummary | null>(null)
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
    const res = await fetch(`/api/intelligence/readiness?listingId=${listingId}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setSnapshot(data.snapshot || null)
    setSummary(null)
  }, [])

  const loadFunnel = useCallback(async (agencyId: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/intelligence/readiness?agencyId=${agencyId}&action=funnel`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setFunnel(data.funnel || null)
  }, [])

  const loadSummary = useCallback(async (listingId: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/intelligence/readiness?listingId=${listingId}&action=blocking`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    if (data.ok && data.summary) setSummary(data.summary)
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      await loadListings(ctx.agencyId)
      await loadFunnel(ctx.agencyId)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectListing = async (id: string) => {
    setSelected(id)
    setLoading(true)
    await loadSnapshot(id)
    if (snapshot) await loadSummary(id)
    setLoading(false)
  }

  const compute = async () => {
    if (!selected) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/intelligence/readiness', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ listingId: selected }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to compute readiness', 'error')
    setSnapshot(data.snapshot || null)
    if (selected) await loadSummary(selected)
    toast('Readiness score updated', 'success')
  }

  if (loading && !selected) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🚀 Seller-Readiness Incubator</h1>
        <p className="text-gray-500 text-sm mt-1">
          Score how market-ready a listing is — financials recast, CIM/BOV, data room, price, seller approval, and compliance.
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
            onClick={compute}
            disabled={!selected || busy}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {busy ? 'Scoring…' : '↻ Score readiness'}
          </button>
        </div>
      </div>

      {/* Readiness-to-close funnel */}
      {funnel && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold mb-1">🫙 Readiness-to-close funnel</h2>
          <p className="text-xs text-gray-400 mb-4">Where your listings sit between score and sale — and what's blocking the pipeline.</p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
            {[
              { label: 'Listings', value: funnel.totalListings, color: '#64748b' },
              { label: 'Scored', value: funnel.scored, color: '#3b82f6' },
              { label: 'Ready (75+)', value: funnel.ready, color: '#22c55e' },
              { label: 'Live on market', value: funnel.active, color: '#0ea5e9' },
              { label: 'In a deal', value: funnel.inDeal, color: '#f59e0b' },
              { label: 'Closed', value: funnel.closed, color: '#10b981' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 text-center">
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wide mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Average readiness score</span>
                <span className="font-semibold">{funnel.avgScore != null ? `${funnel.avgScore}/100` : '—'}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(4, funnel.avgScore || 0)}%`, background: (funnel.avgScore || 0) >= 75 ? '#22c55e' : (funnel.avgScore || 0) >= 45 ? '#f59e0b' : '#ef4444' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>{funnel.needsWork} need work</span>
                <span>{funnel.ready} market-ready</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Top blockers across listings</div>
              {funnel.topBlockers.length === 0 ? (
                <p className="text-sm text-gray-400">No blockers — every scored listing is ready.</p>
              ) : (
                <ul className="space-y-1.5">
                  {funnel.topBlockers.map((b) => (
                    <li key={b.item} className="flex items-center justify-between text-sm">
                      <span className="text-amber-800">☐ {b.item}</span>
                      <span className="text-xs text-gray-400 font-medium">{b.count} listing{b.count === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {!selected ? (
        <p className="text-gray-400 text-sm">Pick a listing to score its market readiness.</p>
      ) : !snapshot ? (
        <p className="text-gray-400 text-sm">No score yet — hit Score readiness to analyze this listing.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Readiness score */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold mb-2">Readiness score</h2>
            <p className={`text-5xl font-bold ${snapshot.readiness_score >= 75 ? 'text-green-600' : snapshot.readiness_score >= 45 ? 'text-amber-600' : 'text-red-600'}`}>
              {snapshot.readiness_score}<span className="text-lg text-gray-400">/100</span>
            </p>
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Valuation estimate</p>
              <p className="text-xl font-semibold">{money(snapshot.valuation_estimate)}</p>
            </div>
            <p className="text-xs text-gray-400 mt-3">Updated {snapshot.updated_at ? new Date(snapshot.updated_at).toLocaleString() : '—'}</p>
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
                      <span>{value >= 100 ? '✓ done' : '—'}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${value >= 100 ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, value)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Action items */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold mb-3">Action items</h2>
            {snapshot.action_items.length === 0 ? (
              <p className="text-sm text-green-600">✅ Fully ready for market.</p>
            ) : (
              <ul className="space-y-2">
                {snapshot.action_items.map((item, i) => (
                  <li key={i} className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    ☐ {item}
                  </li>
                ))}
              </ul>
            )}
            {/* What's blocking — plain-language summary */}
            {summary && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">🧠 What's blocking this close</h3>
                  {summary.model === 'ai' && (
                    <span className="text-[10px] text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5">AI</span>
                  )}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{summary.summary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
