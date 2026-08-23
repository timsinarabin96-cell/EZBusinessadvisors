'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'

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

export default function CompsPage() {
  return (
    <AppShell active="Comps">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <CompsDb />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function CompsDb() {
  const toast = useToast()
  const [comps, setComps] = useState<Comp[]>([])
  const [multiples, setMultiples] = useState<MultiplesRow[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    business_name: '', industry: '', location: '', sale_price: '', revenue: '', sde: '', multiple: '', sold_at: '', notes: '',
  })

  const load = useCallback(async (agency: string) => {
    const token = localStorage.getItem('sb-access-token') || ''
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
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch('/api/comps', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        agencyId,
        business_name: form.business_name.trim(),
        industry: form.industry.trim() || null,
        location: form.location.trim() || null,
        sale_price: form.sale_price ? Number(form.sale_price) : null,
        revenue: form.revenue ? Number(form.revenue) : null,
        sde: form.sde ? Number(form.sde) : null,
        multiple: form.multiple ? Number(form.multiple) : null,
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
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Sale price ($)" type="number" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Revenue ($)" type="number" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="SDE ($)" type="number" value={form.sde} onChange={(e) => setForm({ ...form, sde: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Multiple (auto if blank)" type="number" step="0.01" value={form.multiple} onChange={(e) => setForm({ ...form, multiple: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Sold date" type="date" value={form.sold_at} onChange={(e) => setForm({ ...form, sold_at: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button onClick={submit} disabled={busy} className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg">
          {busy ? 'Adding…' : '+ Add comp'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Sold deals</h2>
        {comps.length === 0 ? (
          <p className="text-gray-400 text-sm">No comps yet — add your first sold deal above.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {comps.map((c) => (
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
        )}
      </div>
    </div>
  )
}
