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
import { getStoredAccessToken } from '@/lib/authToken'

interface Reminder {
  id: string
  listing_id: string | null
  buyer_lead_id: string | null
  seller_lead_id: string | null
  deal_id: string | null
  title: string
  notes: string | null
  kind: string
  due_at: string
  status: string
  created_at: string
  listings?: { business_name: string | null; listing_ref: string | null } | null
  buyer_leads?: { full_name: string | null; company: string | null } | null
  seller_leads?: { full_name: string | null; business_name: string | null } | null
  deals?: { title: string | null } | null
}

interface Counts {
  dueToday: number
  overdue: number
  upcoming: number
  pending: number
}

interface Options {
  listings: { id: string; label: string }[]
  buyers: { id: string; label: string }[]
  sellers: { id: string; label: string }[]
  deals: { id: string; label: string }[]
}

type EntityType = 'listing' | 'buyer' | 'seller' | 'deal' | 'none'

const KIND_ICONS: Record<string, string> = { call_back: '📞', follow_up: '🔁', task: '✅', meeting: '🤝' }
const ENTITY_ICONS: Record<EntityType, string> = { listing: '🏢', buyer: '🤝', seller: '🏷️', deal: '💼', none: '📌' }

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

function entityLabel(r: Reminder): string {
  if (r.listings?.business_name) return `${r.listings.business_name}${r.listings.listing_ref ? ` (${r.listings.listing_ref})` : ''}`
  if (r.buyer_leads?.full_name) return `Buyer: ${r.buyer_leads.full_name}`
  if (r.seller_leads?.business_name || r.seller_leads?.full_name) return `Seller: ${r.seller_leads.business_name || r.seller_leads.full_name}`
  if (r.deals?.title) return `Deal: ${r.deals.title}`
  return ''
}

export function RemindersPanel() {
  const toast = useToast()
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [entityType, setEntityType] = useState<EntityType>('none')
  const [entityId, setEntityId] = useState('')
  const [suggested, setSuggested] = useState('')
  const [options, setOptions] = useState<Options>({ listings: [], buyers: [], sellers: [], deals: [] })

  const load = useCallback(async (agency: string, status: string) => {
    setLoading(true)
    const token = getStoredAccessToken()
    const [listRes, countRes, optRes] = await Promise.all([
      fetch(`/api/reminders?agencyId=${agency}&status=${status}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/reminders?agencyId=${agency}&counts=1`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/reminders?agencyId=${agency}&options=1`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
    ])
    setReminders(listRes.reminders || [])
    setCounts(countRes.counts || null)
    setSuggested(countRes.suggestedNext || '')
    setOptions({
      listings: optRes.listings || [],
      buyers: optRes.buyers || [],
      sellers: optRes.sellers || [],
      deals: optRes.deals || [],
    })
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

  const addReminder = async () => {
    if (!title.trim()) return
    setBusy(true)
    const token = getStoredAccessToken()
    const quick: Record<string, string> = {}
    if (entityType === 'listing' && entityId) quick.listingId = entityId
    if (entityType === 'buyer' && entityId) quick.buyerLeadId = entityId
    if (entityType === 'seller' && entityId) quick.sellerLeadId = entityId
    if (entityType === 'deal' && entityId) quick.dealId = entityId
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ quick, title: title.trim(), due_at: dueAt || suggested, assignToMe: true }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Failed to create reminder', 'error')
      return
    }
    toast('Reminder set ⏰', 'success')
    setTitle('')
    setEntityId('')
    if (agencyId) await load(agencyId, filter)
  }

  const setStatus = async (id: string, status: string) => {
    const token = getStoredAccessToken()
    await fetch('/api/reminders', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reminderId: id, status }),
    })
    if (agencyId) await load(agencyId, filter)
  }

  const snooze = async (id: string, minutes: number) => {
    const token = getStoredAccessToken()
    const res = await fetch('/api/reminders', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reminderId: id, snoozeMinutes: minutes }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return toast(data.error || 'Snooze failed', 'error')
    toast(minutes >= 1440 ? 'Snoozed 1 day ⏰' : 'Snoozed 1 hour ⏰', 'success')
    if (agencyId) await load(agencyId, filter)
  }

  const remove = async (id: string) => {
    const token = getStoredAccessToken()
    await fetch('/api/reminders', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reminderId: id }),
    })
    if (agencyId) await load(agencyId, filter)
  }

  if (loading && !reminders.length) return <LoadingState />

  const entityOptions = entityType === 'listing' ? options.listings : entityType === 'buyer' ? options.buyers : entityType === 'seller' ? options.sellers : entityType === 'deal' ? options.deals : []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">⏰ Reminders</h1>
        <p className="text-gray-500 text-sm mt-1">Call-backs, follow-ups, and tasks — attach to any seller, buyer, listing, or deal.</p>
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

      {/* Quick add — entity-agnostic */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">New reminder</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input className="border rounded-lg px-3 py-2 text-sm md:col-span-2" placeholder="e.g. Follow up on offer, call buyer, chase docs…" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="border rounded-lg px-3 py-2 text-sm" value={entityType} onChange={(e) => { setEntityType(e.target.value as EntityType); setEntityId('') }}>
            <option value="none">General / no link</option>
            <option value="listing">🏢 Listing</option>
            <option value="buyer">🤝 Buyer</option>
            <option value="seller">🏷️ Seller</option>
            <option value="deal">💼 Deal</option>
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={entityId} onChange={(e) => setEntityId(e.target.value)} disabled={entityType === 'none'}>
            <option value="">{entityType === 'none' ? '—' : `Select ${entityType}…`}</option>
            {entityOptions.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <button onClick={addReminder} disabled={busy || !title.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {busy ? '…' : '+ Add'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <input className="border rounded-lg px-3 py-2 text-sm" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          <p className="text-xs text-gray-400 self-center">
            Smart suggestion: {suggested ? new Date(suggested).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'} (business hours)
          </p>
        </div>
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
            const label = entityLabel(r)
            const icon = r.listings?.business_name ? '🏢' : r.buyer_leads?.full_name ? '🤝' : r.seller_leads?.business_name || r.seller_leads?.full_name ? '🏷️' : r.deals?.title ? '💼' : '📌'
            return (
              <div key={r.id} className="p-4 flex items-start gap-3">
                <span className="text-xl shrink-0">{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${r.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                    {KIND_ICONS[r.kind] || ''} {r.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {label && <><span className="font-medium">{label}</span> · </>}
                    due {due.label}
                    {due.overdue && r.status === 'pending' && <span className="text-red-500 font-medium"> · OVERDUE</span>}
                    {!due.overdue && due.today && <span className="text-amber-600 font-medium"> · today</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === 'pending' ? (
                    <>
                      <button onClick={() => setStatus(r.id, 'done')} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1">Done</button>
                      <button onClick={() => snooze(r.id, 60)} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1">Snooze 1h</button>
                      <button onClick={() => snooze(r.id, 1440)} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1">Snooze 1d</button>
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
