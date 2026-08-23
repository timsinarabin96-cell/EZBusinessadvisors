'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'

interface Reminder {
  id: string
  listing_id: string | null
  title: string
  notes: string | null
  kind: string
  due_at: string
  status: string
  created_at: string
  listings?: { business_name: string | null; listing_ref: string | null } | null
}

interface Counts {
  dueToday: number
  overdue: number
  upcoming: number
  pending: number
}

const KIND_ICONS: Record<string, string> = { call_back: '📞', follow_up: '🔁', task: '✅', meeting: '🤝' }

const fmtDue = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const overdue = d < now
  return {
    label: d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
    overdue,
    today: d.toDateString() === now.toDateString(),
  }
}

export default function RemindersPage() {
  return (
    <AppShell active="Reminders">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <Reminders />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function Reminders() {
  const toast = useToast()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [listingId, setListingId] = useState('')
  const [suggested, setSuggested] = useState('')
  const [listings, setListings] = useState<{ id: string; label: string }[]>([])

  const load = useCallback(async (agency: string, status: string) => {
    setLoading(true)
    const token = localStorage.getItem('sb-access-token') || ''
    const [listRes, countRes, optRes] = await Promise.all([
      fetch(`/api/reminders?agencyId=${agency}&status=${status}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/reminders?agencyId=${agency}&counts=1`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/listings/options?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
    ])
    setReminders(listRes.reminders || [])
    setCounts(countRes.counts || null)
    setSuggested(countRes.suggestedNext || '')
    setListings(optRes.listings || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      setAgencyId(ctx.agencyId)
      await load(ctx.agencyId, filter)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeFilter = async (status: string) => {
    setFilter(status)
    if (agencyId) await load(agencyId, status)
  }

  const addReminder = async (quick?: { listingId?: string; title?: string }) => {
    setBusy(true)
    const token = localStorage.getItem('sb-access-token') || ''
    const body = quick
      ? { quick: quick.listingId, title: quick.title, due_at: dueAt || suggested, assignToMe: true }
      : { title: title.trim(), listing_id: listingId || null, due_at: dueAt || suggested, kind: 'call_back', assignToMe: true }
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Failed to create reminder', 'error')
      return
    }
    toast('Reminder set 📞', 'success')
    setTitle('')
    setListingId('')
    if (agencyId) await load(agencyId, filter)
  }

  const setStatus = async (id: string, status: string) => {
    const token = localStorage.getItem('sb-access-token') || ''
    await fetch('/api/reminders', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reminderId: id, status }),
    })
    if (agencyId) await load(agencyId, filter)
  }

  const remove = async (id: string) => {
    const token = localStorage.getItem('sb-access-token') || ''
    await fetch('/api/reminders', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reminderId: id }),
    })
    if (agencyId) await load(agencyId, filter)
  }

  if (loading && !reminders.length) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📞 Call-Back & Reminders</h1>
        <p className="text-gray-500 text-sm mt-1">Never lose a seller again — scheduled call-backs, follow-ups, and tasks.</p>
      </div>

      {/* Counts */}
      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Overdue', value: counts.overdue, color: 'text-red-600 bg-red-50 border-red-200' },
            { label: 'Due today', value: counts.dueToday, color: 'text-amber-600 bg-amber-50 border-amber-200' },
            { label: 'Upcoming', value: counts.upcoming, color: 'text-blue-600 bg-blue-50 border-blue-200' },
            { label: 'Pending total', value: counts.pending, color: 'text-gray-700 bg-gray-50 border-gray-200' },
          ].map((c) => (
            <div key={c.label} className={`rounded-xl border p-4 ${c.color}`}>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs font-medium">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quick add */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">New reminder</h2>
        <div className="flex flex-col md:flex-row gap-2">
          <input className="border rounded-lg px-3 py-2 text-sm flex-1" placeholder="e.g. Call back seller — update on offer" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="border rounded-lg px-3 py-2 text-sm" value={listingId} onChange={(e) => setListingId(e.target.value)}>
            <option value="">Link to listing (optional)</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <input className="border rounded-lg px-3 py-2 text-sm" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          <button onClick={() => addReminder()} disabled={busy || !title.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {busy ? '…' : '+ Add'}
          </button>
        </div>
        {suggested && (
          <p className="text-xs text-gray-400 mt-2">
            Smart suggestion: next call time <span className="font-medium text-gray-600">{new Date(suggested).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span> (business hours)
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['pending', 'done', 'all'].map((s) => (
          <button key={s} onClick={() => changeFilter(s)} className={`text-sm px-3 py-1.5 rounded-full border capitalize ${filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* List */}
      {reminders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No {filter} reminders.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {reminders.map((r) => {
            const due = fmtDue(r.due_at)
            return (
              <div key={r.id} className="p-4 flex items-start gap-3">
                <span className="text-xl shrink-0">{KIND_ICONS[r.kind] || '•'}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${r.status === 'done' ? 'line-through text-gray-400' : ''}`}>{r.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.listings?.business_name && (
                      <>
                        <span className="font-medium">{r.listings.business_name}</span>
                        {r.listings.listing_ref && <span className="text-gray-400"> · {r.listings.listing_ref}</span>}
                        {' · '}
                      </>
                    )}
                    due {due.label}
                    {due.overdue && r.status === 'pending' && <span className="text-red-500 font-medium"> · OVERDUE</span>}
                    {!due.overdue && due.today && <span className="text-amber-600 font-medium"> · today</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === 'pending' ? (
                    <>
                      <button onClick={() => setStatus(r.id, 'done')} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">Done</button>
                      <button onClick={() => remove(r.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setStatus(r.id, 'pending')} className="text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-3 py-1">Reopen</button>
                      <button onClick={() => remove(r.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
