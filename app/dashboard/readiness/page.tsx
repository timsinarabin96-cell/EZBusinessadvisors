'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'

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
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadListings = useCallback(async (agencyId: string) => {
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch(`/api/listings/options?agencyId=${agencyId}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setListings(data.listings || [])
  }, [])

  const loadSnapshot = useCallback(async (listingId: string) => {
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch(`/api/intelligence/readiness?listingId=${listingId}`, { headers: { authorization: `Bearer ${token}` } })
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

  const compute = async () => {
    if (!selected) return
    setBusy(true)
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch('/api/intelligence/readiness', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ listingId: selected }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to compute readiness', 'error')
    setSnapshot(data.snapshot || null)
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
          </div>
        </div>
      )}
    </div>
  )
}
