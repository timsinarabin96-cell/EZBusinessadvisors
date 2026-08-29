/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import MoneyInput from '@/components/ui/MoneyInput'
import { getStoredAccessToken } from '@/lib/authToken'

interface Comp {
  id: string
  business_name: string
  industry: string | null
  location: string | null
  sale_price: number | null
  revenue: number | null
  sde: number | null
  multiple: number | null
  sold_at: string | null
  notes: string | null
}

interface MultiplesRow {
  industry: string
  avg_multiple: number
  count: number
  avg_sale_price: number
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '—')

export function CompsDb() {
  const toast = useToast()
  const [comps, setComps] = useState<Comp[]>([])
  const [multiples, setMultiples] = useState<MultiplesRow[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState({
    business_name: '', industry: '', location: '', sale_price: '', revenue: '', sde: '', multiple: '', sold_at: '', notes: '',
  })

  const load = useCallback(async (agency: string) => {
    const token = getStoredAccessToken()
    const [compRes, multRes] = await Promise.all([
      fetch(`/api/comps?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/comps?agencyId=${agency}&summary=multiples`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
    ])
    setComps(compRes.comps || [])
    setMultiples(multRes.summary || [])
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      setAgencyId(ctx.agencyId)
      await load(ctx.agencyId)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async () => {
    if (!form.business_name.trim()) return toast('Business name is required', 'error')
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/comps', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        agencyId,
        business_name: form.business_name.trim(),
        industry: form.industry.trim() || null,
        location: form.location.trim() || null,
        sale_price: form.sale_price ? Number(form.sale_price.replace(/[$,]/g, '')) : null,
        revenue: form.revenue ? Number(form.revenue.replace(/[$,]/g, '')) : null,
        sde: form.sde ? Number(form.sde.replace(/[$,]/g, '')) : null,
        multiple: form.multiple ? Number(form.multiple.replace(/[$,]/g, '')) : null,
        sold_at: form.sold_at || null,
        notes: form.notes.trim() || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to add comp', 'error')
    toast('Comp added', 'success')
    setForm({ business_name: '', industry: '', location: '', sale_price: '', revenue: '', sde: '', multiple: '', sold_at: '', notes: '' })
    if (agencyId) await load(agencyId)
  }

  if (loading) return <LoadingState />

  const exportCsv = () => {
    if (!comps.length) return
    const header = 'business_name,industry,location,sale_price,revenue,sde,multiple,sold_at,notes'
    const rows = comps.map((c) =>
      [c.business_name, c.industry || '', c.location || '', c.sale_price ?? '', c.revenue ?? '', c.sde ?? '', c.multiple ?? '', c.sold_at || '', (c.notes || '').replace(/,/g, ' ')].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comps-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast('CSV exported', 'success')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📊 Comps Database</h1>
        <p className="text-gray-500 text-sm mt-1">Track sold deals and their multiples to power future valuations.</p>
      </div>

      {multiples.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold mb-3">Multiples by industry</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {multiples.map((m) => (
              <div key={m.industry} className="border border-gray-100 rounded-lg p-3">
                <p className="text-sm font-medium">{m.industry}</p>
                <p className="text-xl font-bold text-blue-600">{m.avg_multiple}×</p>
                <p className="text-xs text-gray-500">{m.count} comps · avg {money(m.avg_sale_price)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Add a comp</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input className="border rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Business name *" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <MoneyInput value={form.sale_price} onChange={(v) => setForm({ ...form, sale_price: v })} />
          <MoneyInput value={form.revenue} onChange={(v) => setForm({ ...form, revenue: v })} />
          <MoneyInput value={form.sde} onChange={(v) => setForm({ ...form, sde: v })} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Multiple (auto if blank)" type="number" step="0.01" value={form.multiple} onChange={(e) => setForm({ ...form, multiple: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Sold date" type="date" value={form.sold_at} onChange={(e) => setForm({ ...form, sold_at: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button onClick={submit} disabled={busy} className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg">
          {busy ? 'Adding…' : '+ Add comp'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Sold deals</h2>
          {comps.length > 0 && (
            <button onClick={exportCsv} className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium px-3 py-1.5 rounded-lg">
              ⬇ Export CSV
            </button>
          )}
        </div>
        {comps.length === 0 ? (
          <p className="text-gray-400 text-sm">No comps yet — add your first sold deal above.</p>
        ) : (
          <>
            {/* Industry filter chips */}
            {(() => {
              const industries = Array.from(new Set(comps.map((c) => c.industry).filter(Boolean))) as string[]
              if (!industries.length) return null
              const chip = (active: boolean) => ({
                padding: '5px 12px', borderRadius: 99, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: active ? '#1a1a2e' : '#fff', color: active ? '#fff' : '#666',
                border: active ? '1px solid #1a1a2e' : '1px solid #e5e2d8',
              })
              return (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  <button style={chip(filter === 'all')} onClick={() => setFilter('all')}>All</button>
                  {industries.map((ind) => (
                    <button key={ind} style={chip(filter === ind)} onClick={() => setFilter(filter === ind ? 'all' : ind)}>
                      {ind}
                    </button>
                  ))}
                </div>
              )
            })()}
            <ul className="divide-y divide-gray-100">
              {comps.filter((c) => filter === 'all' || c.industry === filter).map((c) => (
                <li key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{c.business_name}</p>
                    <p className="text-xs text-gray-500">
                      {[c.industry, c.location].filter(Boolean).join(' · ') || '—'} · sold {fmtDate(c.sold_at)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{money(c.sale_price)}</p>
                    <p className="text-xs text-gray-500">{c.multiple ? `${c.multiple}× SDE` : '—'}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
