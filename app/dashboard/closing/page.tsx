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
import { formatWithCommas } from '@/components/ui/MoneyInput'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'
import { PageHero, EmptyState } from '@/components/ui/premium'

interface Milestone {
  id: string
  title: string
  category: string
  due_date: string | null
  completed_at: string | null
  notes: string | null
  sort_order: number
}

interface Escrow {
  id: string
  escrow_company: string | null
  account_ref: string | null
  amount: number | null
  status: string
  notes: string | null
}

interface Progress {
  total: number
  completed: number
  percent: number
  overdue: number
  nextDue: string | null
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

export default function ClosingPage() {
  return (
    <AppShell active="Closing Tracker">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <ClosingTracker />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function ClosingTracker() {
  const toast = useToast()
  const [listings, setListings] = useState<{ id: string; label: string }[]>([])
  const [tracked, setTracked] = useState<{ id: string; label: string }[]>([])
  const [selected, setSelected] = useState('')
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [escrow, setEscrow] = useState<Escrow[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [escrowForm, setEscrowForm] = useState({ company: '', ref: '', amount: '' })

  const loadListings = useCallback(async (agencyId: string) => {
    const token = getStoredAccessToken()
    const [optRes, trackedRes] = await Promise.all([
      fetch(`/api/listings/options?agencyId=${agencyId}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/closing?agencyId=${agencyId}&tracked=1`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
    ])
    setListings(optRes.listings || [])
    setTracked(
      (trackedRes.listings || []).map((l: any) => ({
        id: l.id,
        label: `${l.business_name || 'Listing'}${l.asking_price ? ` — ${money(l.asking_price)}` : ''}`,
      })),
    )
  }, [])

  const loadTracker = useCallback(async (listingId: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/closing?listingId=${listingId}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setMilestones(data.milestones || [])
    setEscrow(data.escrow || [])
    setProgress(data.progress || null)
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
    const token = getStoredAccessToken()
    // Seed the standard checklist if this listing has none yet.
    await fetch('/api/closing', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'seed', listingId: id }),
    })
    await loadTracker(id)
    setLoading(false)
  }

  const addMilestone = async () => {
    if (!selected || !newTitle.trim()) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/closing', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'milestone', listing_id: selected, title: newTitle.trim(), due_date: newDue || null }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to add milestone', 'error')
    setNewTitle('')
    setNewDue('')
    toast('Milestone added', 'success')
    await loadTracker(selected)
  }

  const toggleMilestone = async (m: Milestone) => {
    const token = getStoredAccessToken()
    await fetch('/api/closing', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ milestoneId: m.id, completed: !m.completed_at }),
    })
    await loadTracker(selected)
  }

  const deleteMilestone = async (id: string) => {
    const token = getStoredAccessToken()
    await fetch('/api/closing', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ milestoneId: id }),
    })
    await loadTracker(selected)
  }

  const loadTemplate = async (stage: string) => {
    if (!selected) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/closing', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'template', listingId: selected, stage }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Could not load template', 'error')
    toast(`Stage checklist added (${data.added ?? 0} items)`, 'success')
    await loadTracker(selected)
  }

  const addEscrow = async () => {
    if (!selected || !escrowForm.company.trim()) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/closing', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'escrow',
        listing_id: selected,
        escrow_company: escrowForm.company.trim(),
        account_ref: escrowForm.ref.trim() || null,
        amount: escrowForm.amount ? Number(String(escrowForm.amount).replace(/[$,]/g, '')) : null,
        status: 'pending',
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to add escrow', 'error')
    setEscrowForm({ company: '', ref: '', amount: '' })
    toast('Escrow account added', 'success')
    await loadTracker(selected)
  }

  const setEscrowStatus = async (e: Escrow, status: string) => {
    const token = getStoredAccessToken()
    await fetch('/api/closing', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ escrowId: e.id, status }),
    })
    await loadTracker(selected)
  }

  if (loading && !selected) return <LoadingState />

  return (
    <div>
      <PageHero
        icon="🏁"
        eyebrow="Closing Tracker"
        title="Closing & Escrow Tracker"
        sub="Milestone checklist from LOI through close, plus escrow accounts. Pick a listing to open its tracker."
      />

      <div className="p-card p-card-pad mb-6">
        <h2 className="font-semibold mb-3">Select a deal</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <select className="border rounded-lg px-3 py-2 text-sm flex-1" value={selected} onChange={(e) => selectListing(e.target.value)}>
            <option value="">Choose a listing…</option>
            <optgroup label="Active trackers">
              {tracked.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </optgroup>
            <optgroup label="All listings">
              {listings
                .filter((l) => !tracked.some((t) => t.id === l.id))
                .map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
            </optgroup>
          </select>
        </div>
      </div>

      {selected && progress && (
        <>
          {/* Progress bar */}
          <div className="p-card p-card-pad mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Closing progress</h2>
              <span className="text-sm font-bold text-blue-600">{progress.percent}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {progress.completed}/{progress.total} milestones done
              {progress.overdue > 0 && <span className="text-red-500 font-medium"> · {progress.overdue} overdue</span>}
              {progress.nextDue && <span> · next due {fmtDate(progress.nextDue)}</span>}
            </p>
          </div>

          {/* Milestones */}
          <div className="p-card p-card-pad mb-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="font-semibold">Milestones</h2>
              {/* Per-stage checklist templates — one click loads the stage's full checklist */}
              {selected && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-gray-400 mr-1">Load stage:</span>
                  {[['loi', 'LOI'], ['psa', 'PSA'], ['diligence', 'Diligence'], ['escrow', 'Escrow'], ['closing', 'Closing'], ['transition', 'Transition']].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => loadTemplate(id)}
                      disabled={busy}
                      className="text-xs border border-gray-200 rounded-full px-3 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      + {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {milestones.length === 0 ? (
              <p className="text-gray-400 text-sm">No milestones yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {milestones.map((m) => (
                  <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={!!m.completed_at}
                        onChange={() => toggleMilestone(m)}
                        className="w-4 h-4 accent-blue-600"
                      />
                      <div>
                        <p className={`text-sm font-medium ${m.completed_at ? 'line-through text-gray-400' : ''}`}>{m.title}</p>
                        <p className="text-xs text-gray-500">
                          <span className="capitalize">{m.category}</span>
                          {m.due_date && <> · due {fmtDate(m.due_date)}{!m.completed_at && new Date(m.due_date) < new Date() && <span className="text-red-500"> (overdue)</span>}</>}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => deleteMilestone(m.id)} className="text-xs text-red-500 hover:underline shrink-0">
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col md:flex-row gap-2 mt-4 pt-4 border-t border-gray-100">
              <input className="border rounded-lg px-3 py-2 text-sm flex-1" placeholder="New milestone (e.g. Lease assignment signed)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <input className="border rounded-lg px-3 py-2 text-sm" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
              <button onClick={addMilestone} disabled={busy || !newTitle.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                + Add
              </button>
            </div>
          </div>

          {/* Escrow */}
          <div className="p-card p-card-pad">
            <h2 className="font-semibold mb-3">Escrow accounts</h2>
            {escrow.length === 0 ? (
              <p className="text-gray-400 text-sm">No escrow accounts yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {escrow.map((e) => (
                  <li key={e.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{e.escrow_company || 'Escrow'}{e.account_ref ? ` · ${e.account_ref}` : ''}</p>
                      <p className="text-xs text-gray-500">
                        {money(e.amount)} · <span className="capitalize">{e.status}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.status === 'pending' && (
                        <button onClick={() => setEscrowStatus(e, 'funded')} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">
                          Mark funded
                        </button>
                      )}
                      {e.status === 'funded' && (
                        <>
                          <button onClick={() => setEscrowStatus(e, 'released')} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1">
                            Released
                          </button>
                          <button onClick={() => setEscrowStatus(e, 'refunded')} className="text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-3 py-1">
                            Refunded
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col md:flex-row gap-2 mt-4 pt-4 border-t border-gray-100">
              <input className="border rounded-lg px-3 py-2 text-sm flex-1" placeholder="Escrow company (e.g. First American Title)" value={escrowForm.company} onChange={(e) => setEscrowForm({ ...escrowForm, company: e.target.value })} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Acct ref" value={escrowForm.ref} onChange={(e) => setEscrowForm({ ...escrowForm, ref: e.target.value })} />
              <input className="border rounded-lg px-3 py-2 text-sm" placeholder="$ amount" inputMode="decimal" value={escrowForm.amount} onChange={(e) => setEscrowForm({ ...escrowForm, amount: formatWithCommas(e.target.value) })} />
              <button onClick={addEscrow} disabled={busy || !escrowForm.company.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                + Add escrow
              </button>
            </div>
          </div>
        </>
      )}

      {!selected && (
        <EmptyState
          icon="🗂️"
          title="No tracker open"
          sub="Select a listing above to open its closing tracker."
        />
      )}
    </div>
  )
}
