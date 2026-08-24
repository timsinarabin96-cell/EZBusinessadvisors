'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import MoneyInput from '@/components/ui/MoneyInput'

interface Commission {
  id: string
  listing_id: string | null
  deal_id: string | null
  agent_profile_id: string | null
  amount: number | null
  commission_pct: number | null
  status: 'pending' | 'approved' | 'paid'
  paid_at: string | null
  notes: string | null
  created_at: string
  listings?: { business_name?: string | null } | null
  profiles?: { full_name?: string | null } | null
}

const STATUS_FLOW = ['pending', 'approved', 'paid'] as const
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  paid: 'bg-green-50 text-green-700 border-green-200',
}
const money = (n: number | null | undefined) => (n != null ? '$' + Number(n).toLocaleString() : '—')
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function CommissionsPage() {
  return (
    <AppShell active="Commissions">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <CommissionsApp />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function CommissionsApp() {
  const toast = useToast()
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [listingId, setListingId] = useState('')
  const [agentProfileId, setAgentProfileId] = useState('')
  const [amount, setAmount] = useState('')
  const [commissionPct, setCommissionPct] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async (agency: string) => {
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch(`/api/commissions?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setCommissions(data.commissions || [])
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

  const authHeaders = () => ({
    authorization: `Bearer ${localStorage.getItem('sb-access-token') || ''}`,
    'content-type': 'application/json',
  })

  const record = async () => {
    setSaving(true)
    const res = await fetch('/api/commissions', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        agencyId,
        listingId: listingId || null,
        agentProfileId: agentProfileId || null,
        amount: amount ? Number(amount.replace(/[$,]/g, '')) : null,
        commissionPct: commissionPct ? Number(commissionPct) : null,
        notes: notes || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Could not record commission', 'error')
      return
    }
    toast('Commission recorded', 'success')
    setListingId('')
    setAgentProfileId('')
    setAmount('')
    setCommissionPct('')
    setNotes('')
    await load(agencyId)
  }

  const advanceStatus = async (commission: Commission) => {
    const idx = STATUS_FLOW.indexOf(commission.status)
    const next = STATUS_FLOW[idx + 1]
    if (!next) return
    const res = await fetch('/api/commissions', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ id: commission.id, status: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      toast(data.error || 'Could not update commission', 'error')
      return
    }
    toast(`Marked ${next}`, 'success')
    await load(agencyId)
  }

  const exportCsv = async () => {
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch(`/api/commissions?agencyId=${agencyId}&format=csv`, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) {
      toast('Could not export CSV', 'error')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'commissions.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast('CSV downloaded', 'success')
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">💰 Commission & Payouts</h1>
        <p className="text-gray-500 text-sm mt-1">
          Track every commission owed on a deal — pending → approved → paid — and export the ledger to CSV.
        </p>
      </div>

      {/* Waterfall summary — totals by status + payout pipeline */}
      {commissions.length > 0 && (() => {
        const byStatus = { pending: 0, approved: 0, paid: 0 }
        let total = 0
        commissions.forEach((c) => {
          const amt = Number(c.amount) || 0
          total += amt
          if (c.status === 'pending' || c.status === 'approved' || c.status === 'paid') byStatus[c.status] += amt
        })
        const pipeline = total > 0 ? Math.round(((byStatus.paid + byStatus.approved) / total) * 100) : 0
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Payout pipeline</h2>
              <span className="text-sm text-gray-500">{commissions.length} commission{commissions.length === 1 ? '' : 's'} · {money(total)} total</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {(['pending', 'approved', 'paid'] as const).map((s) => (
                <div key={s} className={`rounded-lg border p-3 ${STATUS_COLORS[s]}`}>
                  <div className="text-xs font-medium uppercase tracking-wide">{s}</div>
                  <div className="text-lg font-bold mt-1">{money(byStatus[s])}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{ width: `${pipeline}%`, transition: 'width .4s' }}
                />
              </div>
              <span className="text-xs text-gray-500 shrink-0">{pipeline}% of pipeline earned (approved + paid)</span>
            </div>
          </div>
        )
      })()}

      {/* Deal economics waterfall — per-deal commission flow */}
      {commissions.length > 0 && (() => {
        // Group commissions by deal/listing so each deal gets its own waterfall.
        const groups = new Map<string, { name: string; items: Commission[]; total: number }>()
        commissions.forEach((c) => {
          const key = c.listing_id || c.deal_id || 'ungrouped'
          const name = c.listings?.business_name || (c.listing_id ? 'Listing' : 'Deal')
          if (!groups.has(key)) groups.set(key, { name, items: [], total: 0 })
          const g = groups.get(key)!
          g.items.push(c)
          g.total += Number(c.amount) || 0
        })
        const deals = [...groups.values()].sort((a, b) => b.total - a.total).slice(0, 6)
        const maxTotal = Math.max(...deals.map((d) => d.total), 1)

        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold">Deal economics waterfall</h2>
              <span className="text-xs text-gray-400">Commission per deal — pending → approved → paid</span>
            </div>
            <div className="flex flex-col gap-4 mt-4">
              {deals.map((deal) => {
                const s = { pending: 0, approved: 0, paid: 0 }
                deal.items.forEach((c) => {
                  const amt = Number(c.amount) || 0
                  if (c.status === 'pending' || c.status === 'approved' || c.status === 'paid') s[c.status] += amt
                })
                const earned = s.approved + s.paid
                const pct = maxTotal > 0 ? (deal.total / maxTotal) * 100 : 0
                return (
                  <div key={deal.name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium truncate">{deal.name}</span>
                      <span className="text-gray-500 shrink-0 ml-3">{money(deal.total)}{earned > 0 ? ` · ${Math.round((earned / deal.total) * 100)}% earned` : ''}</span>
                    </div>
                    {/* Stacked waterfall bar: paid (green) + approved (blue) + pending (amber) */}
                    <div className="flex h-7 rounded-lg overflow-hidden bg-gray-50 border border-gray-100" style={{ maxWidth: `${Math.max(pct, 18)}%` }}>
                      {s.paid > 0 && (
                        <div className="h-full bg-green-500" style={{ width: `${(s.paid / deal.total) * 100}%` }} title={`Paid ${money(s.paid)}`} />
                      )}
                      {s.approved > 0 && (
                        <div className="h-full bg-blue-500" style={{ width: `${(s.approved / deal.total) * 100}%` }} title={`Approved ${money(s.approved)}`} />
                      )}
                      {s.pending > 0 && (
                        <div className="h-full bg-amber-400" style={{ width: `${(s.pending / deal.total) * 100}%` }} title={`Pending ${money(s.pending)}`} />
                      )}
                    </div>
                    <div className="flex gap-4 text-[11px] text-gray-400 mt-1">
                      {s.paid > 0 && <span>● {money(s.paid)} paid</span>}
                      {s.approved > 0 && <span>● {money(s.approved)} approved</span>}
                      {s.pending > 0 && <span>● {money(s.pending)} pending</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Record commission */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Record a commission</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Listing ID" value={listingId} onChange={(e) => setListingId(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Agent profile ID" value={agentProfileId} onChange={(e) => setAgentProfileId(e.target.value)} />
          <MoneyInput value={amount} onChange={setAmount} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Commission %" type="number" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm md:col-span-2" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={record}
            disabled={saving || !amount}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {saving ? 'Saving…' : '+ Record commission'}
          </button>
          <button
            onClick={exportCsv}
            className="border border-gray-300 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg"
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* Commission list */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Commissions</h2>
        {commissions.length === 0 ? (
          <p className="text-gray-400 text-sm">No commissions yet. Record your first one above.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {commissions.map((commission) => {
              const idx = STATUS_FLOW.indexOf(commission.status)
              const next = STATUS_FLOW[idx + 1]
              return (
                <li key={commission.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">
                      {commission.listings?.business_name || 'Listing'} · {money(commission.amount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Agent: {commission.profiles?.full_name || '—'}
                      {commission.commission_pct != null ? ` · ${commission.commission_pct}%` : ''}
                      {' · '}
                      {fmtDate(commission.created_at)}
                      {commission.paid_at ? ` · paid ${fmtDate(commission.paid_at)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs border rounded-full px-2 py-0.5 ${STATUS_COLORS[commission.status] || ''}`}>
                      {commission.status}
                    </span>
                    {next && (
                      <button onClick={() => advanceStatus(commission)} className="text-xs text-blue-600 hover:underline">
                        Mark {next}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
