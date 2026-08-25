'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

interface ListingOpt {
  id: string
  label: string
}

interface EstimateRow {
  id: string
  listing_id: string | null
  estimate_min: number | null
  estimate_max: number | null
  midpoint: number | null
  method: string | null
  created_at: string
  multiples?: { industry?: string; sde?: { min?: number; max?: number }; revenue?: { min?: number; max?: number }; margin_adjustment?: number }
  inputs?: { business_name?: string | null; annual_revenue?: number | null; sde?: number | null; asking_price?: number | null }
  listings?: { business_name: string | null; industry: string | null; asking_price: number | null } | null
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function ValuationPage() {
  return (
    <AppShell active="Valuation Engine">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <ValuationEngine />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function ValuationEngine() {
  const toast = useToast()
  const [listings, setListings] = useState<ListingOpt[]>([])
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [market, setMarket] = useState<{ deals: number; avgMultiple: number | null; avgPrice: number | null } | null>(null)

  // Live market reference — anonymized sold-comps averages to compare against.
  useEffect(() => {
    import('@/lib/soldComps').then(({ buildSoldCompsReport }) =>
      buildSoldCompsReport().then((r) =>
        setMarket({ deals: r.totals.deals, avgMultiple: r.totals.avgMultiple, avgPrice: r.totals.avgSalePrice }),
      ),
    ).catch(() => {})
  }, [])

  const load = useCallback(async (agency: string) => {
    const token = getStoredAccessToken()
    const [listingRes, estRes] = await Promise.all([
      fetch(`/api/listings/options?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/intelligence/valuation?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) =>
        r.json().catch(() => ({})),
      ),
    ])
    setListings(listingRes.listings || [])
    setEstimates(estRes.estimates || [])
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) {
        setLoading(false)
        return
      }
      setAgencyId(ctx.agencyId)
      await load(ctx.agencyId)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const estimate = async () => {
    if (!selected) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/intelligence/valuation', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ listingId: selected }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Failed to estimate value', 'error')
      return
    }
    toast('Valuation estimate created', 'success')
    if (agencyId) await load(agencyId)
  }

  const exportEstimates = () => {
    if (!estimates.length) return
    const header = 'business,industry,asking,estimate_min,estimate_max,midpoint,method,created_at'
    const rows = estimates.map((est) =>
      [
        est.inputs?.business_name || est.listings?.business_name || '',
        est.listings?.industry || est.multiples?.industry || '',
        est.inputs?.asking_price ?? est.listings?.asking_price ?? '',
        est.estimate_min ?? '',
        est.estimate_max ?? '',
        est.midpoint ?? '',
        est.method || '',
        est.created_at || '',
      ].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `valuations-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast('Estimates exported', 'success')
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📐 Seller Valuation Engine</h1>
        <p className="text-gray-500 text-sm mt-1">
          Range estimates from an SDE-multiple table (default 2.5–3.5× SDE) cross-checked against 0.8–1.2× revenue, with industry and margin adjustments.
        </p>
      </div>

      {/* Market reference — compare against live sold-comps averages */}
      {market && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold">📊 Market reference</h2>
              <p className="text-xs text-gray-500 mt-1">Live anonymized averages from closed sales — sanity-check your estimate against the market.</p>
            </div>
            <a href="/marketplace/pulse" className="text-xs text-blue-600 hover:underline">Full market pulse →</a>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
              <p className="text-xs text-gray-400">Avg sale multiple</p>
              <p className="text-lg font-bold text-gray-800 mt-1">{market.avgMultiple != null ? `${market.avgMultiple.toFixed(2)}×` : '—'}</p>
            </div>
            <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
              <p className="text-xs text-gray-400">Avg sale price</p>
              <p className="text-lg font-bold text-gray-800 mt-1">{market.avgPrice != null ? `$${Math.round(market.avgPrice).toLocaleString()}` : '—'}</p>
            </div>
            <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
              <p className="text-xs text-gray-400">Closed transactions</p>
              <p className="text-lg font-bold text-gray-800 mt-1">{market.deals.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Estimate a listing</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <select className="border rounded-lg px-3 py-2 text-sm flex-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select a listing…</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <button
            onClick={estimate}
            disabled={!selected || busy}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
          >
            {busy ? 'Estimating…' : 'Estimate value'}
          </button>
        </div>
        {listings.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">No listings yet — create a listing first.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Estimates — range history</h2>
          {estimates.length > 1 && (
            <button onClick={exportEstimates} className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium px-3 py-1.5 rounded-lg">
              ⬇ Export CSV
            </button>
          )}
        </div>
        {estimates.length === 0 ? (
          <p className="text-gray-400 text-sm">No estimates yet.</p>
        ) : (
          <>
            {/* Trend band — min/max range per estimate, oldest → newest */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 90, marginBottom: 18, padding: '0 4px' }}>
              {estimates.slice().reverse().map((est) => {
                const min = Number(est.estimate_min) || 0
                const max = Number(est.estimate_max) || 0
                const mid = Number(est.midpoint) || 0
                const maxAll = Math.max(1, ...estimates.map((e) => Number(e.estimate_max) || 0))
                const barMin = Math.round((min / maxAll) * 78) + 4
                const barMax = Math.round((max / maxAll) * 78) + 4
                const barMid = Math.round((mid / maxAll) * 78) + 4
                return (
                  <div key={est.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }} title={`${money(min)}–${money(max)}`}>
                    <div style={{ position: 'relative', width: '100%', height: 84, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div style={{ position: 'absolute', bottom: barMin, width: '60%', background: '#e2e8f0', borderRadius: 3, height: Math.max(2, barMax - barMin) }} />
                      <div style={{ position: 'absolute', bottom: barMid - 2, width: '60%', background: '#1e40af', borderRadius: 3, height: 4 }} />
                    </div>
                    <span style={{ fontSize: 9.5, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(est.created_at)}</span>
                  </div>
                )
              })}
            </div>
            <ul className="divide-y divide-gray-100">
            {estimates.map((est) => {
              const m = est.multiples || {}
              return (
                <li key={est.id} className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{est.inputs?.business_name || est.listings?.business_name || 'Listing'}</p>
                      <p className="text-xs text-gray-500">
                        {est.listings?.industry || est.multiples?.industry || '—'} · asking {money(est.inputs?.asking_price ?? est.listings?.asking_price)} ·{' '}
                        {fmtDate(est.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {money(est.estimate_min)} – {money(est.estimate_max)}
                      </p>
                      <p className="text-xs text-gray-500">midpoint {money(est.midpoint)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="border border-gray-100 rounded-lg p-2 bg-gray-50">
                      <p className="text-gray-400">Method</p>
                      <p className="text-gray-700 mt-0.5">{est.method || '—'}</p>
                    </div>
                    <div className="border border-gray-100 rounded-lg p-2 bg-gray-50">
                      <p className="text-gray-400">SDE multiple</p>
                      <p className="text-gray-700 mt-0.5">
                        {m.sde?.min != null ? `${m.sde.min}–${m.sde.max}×` : '—'} (SDE {money(est.inputs?.sde)})
                      </p>
                    </div>
                    <div className="border border-gray-100 rounded-lg p-2 bg-gray-50">
                      <p className="text-gray-400">Revenue cross-check</p>
                      <p className="text-gray-700 mt-0.5">
                        {m.revenue?.min != null ? `${m.revenue.min}–${m.revenue.max}×` : '—'} (revenue {money(est.inputs?.annual_revenue)})
                      </p>
                    </div>
                    <div className="border border-gray-100 rounded-lg p-2 bg-gray-50">
                      <p className="text-gray-400">Margin adjustment</p>
                      <p className="text-gray-700 mt-0.5">{m.margin_adjustment != null ? `${m.margin_adjustment > 0 ? '+' : ''}${m.margin_adjustment}×` : '—'}</p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          </>
        )}
      </div>
    </div>
  )
}
