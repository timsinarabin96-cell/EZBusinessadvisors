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

interface Comm {
  id: string
  channel: string
  direction: string
  outcome: string
  contact_name: string | null
  summary: string | null
  created_at: string
  listings?: { business_name: string | null; listing_ref: string | null } | null
  buyer_leads?: { full_name: string | null; company: string | null } | null
  seller_leads?: { full_name: string | null; business_name: string | null } | null
  deals?: { title: string | null } | null
}

interface StaleItem {
  entity_type: 'listing' | 'buyer' | 'seller' | 'deal'
  id: string
  label: string
  ref?: string | null
  status?: string | null
  last_contacted_at: string | null
  days_since: number
}

const CHANNEL_ICONS: Record<string, string> = { call: '📞', email: '✉️', sms: '💬', meeting: '🤝', other: '📌' }
const TYPE_ICONS: Record<string, string> = { listing: '🏢', buyer: '🤝', seller: '🏷️', deal: '💼' }

const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

function commLabel(c: Comm): string {
  if (c.listings?.business_name) return `${c.listings.business_name}${c.listings.listing_ref ? ` (${c.listings.listing_ref})` : ''}`
  if (c.buyer_leads?.full_name) return `Buyer: ${c.buyer_leads.full_name}`
  if (c.seller_leads?.business_name || c.seller_leads?.full_name) return `Seller: ${c.seller_leads.business_name || c.seller_leads.full_name}`
  if (c.deals?.title) return `Deal: ${c.deals.title}`
  return 'General'
}

export default function CommunicationsPage() {
  return (
    <AppShell active="Communications">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <Communications />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function Communications() {
  const toast = useToast()
  const [comms, setComms] = useState<Comm[]>([])
  const [stale, setStale] = useState<StaleItem[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [entityType, setEntityType] = useState<'listing' | 'buyer' | 'seller' | 'deal' | 'none'>('none')
  const [entityId, setEntityId] = useState('')
  const [channel, setChannel] = useState('call')
  const [direction, setDirection] = useState('outbound')
  const [outcome, setOutcome] = useState('talked')
  const [summary, setSummary] = useState('')
  const [autoReschedule, setAutoReschedule] = useState(true)
  const [options, setOptions] = useState<{ listings: { id: string; label: string }[]; buyers: { id: string; label: string }[]; sellers: { id: string; label: string }[]; deals: { id: string; label: string }[] }>({ listings: [], buyers: [], sellers: [], deals: [] })

  const load = useCallback(async (agency: string) => {
    setLoading(true)
    const token = getStoredAccessToken()
    const [commRes, staleRes, optRes] = await Promise.all([
      fetch(`/api/communications?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/stale?agencyId=${agency}&days=14`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/reminders?agencyId=${agency}&options=1`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
    ])
    setComms(commRes.communications || [])
    setStale(staleRes.stale || [])
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
      await load(ctx.agencyId)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const log = async () => {
    if (!summary.trim() && entityType === 'none') {
      toast('Add a summary or link an entity', 'error')
      return
    }
    setBusy(true)
    const token = getStoredAccessToken()
    const body: Record<string, unknown> = {
      channel, direction, outcome, summary: summary.trim() || null,
      auto_reschedule: autoReschedule,
    }
    if (entityType === 'listing' && entityId) body.listing_id = entityId
    if (entityType === 'buyer' && entityId) body.buyer_lead_id = entityId
    if (entityType === 'seller' && entityId) body.seller_lead_id = entityId
    if (entityType === 'deal' && entityId) body.deal_id = entityId
    const res = await fetch('/api/communications', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Failed to log', 'error')
      return
    }
    toast(data.reminder ? 'Logged + call-back scheduled 📞' : 'Logged ✅', 'success')
    setSummary('')
    setEntityId('')
    if (agencyId) await load(agencyId)
  }

  const remindStale = async (item: StaleItem) => {
    const token = getStoredAccessToken()
    const quick: Record<string, string> = { [item.entity_type === 'listing' ? 'listingId' : item.entity_type === 'buyer' ? 'buyerLeadId' : item.entity_type === 'seller' ? 'sellerLeadId' : 'dealId']: item.id }
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ quick, title: `Call back — ${item.label}`, assignToMe: true }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return toast(data.error || 'Failed', 'error')
    toast('Reminder set ⏰', 'success')
  }

  if (loading && !comms.length) return <LoadingState />

  const entityOptions = entityType === 'listing' ? options.listings : entityType === 'buyer' ? options.buyers : entityType === 'seller' ? options.sellers : entityType === 'deal' ? options.deals : []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🗒️ Communication Log</h1>
        <p className="text-gray-500 text-sm mt-1">Every call, email, and meeting — logged and linked. Unanswered calls auto-schedule a call-back.</p>
      </div>

      {/* Stale deals */}
      {stale.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-amber-800 mb-1">⚠️ Stale — no contact in 14 days</h2>
          <p className="text-xs text-amber-700 mb-3">These deals are going cold. Call them today.</p>
          <div className="space-y-2">
            {stale.slice(0, 8).map((s) => (
              <div key={s.entity_type + s.id} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-amber-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{TYPE_ICONS[s.entity_type]} {s.label}{s.ref ? ` (${s.ref})` : ''}</p>
                  <p className="text-xs text-gray-500">
                    {s.last_contacted_at ? `Last contact ${fmtTime(s.last_contacted_at)}` : 'Never contacted'}
                    {s.days_since !== Infinity && <span className="text-amber-700 font-medium"> · {s.days_since}d ago</span>}
                  </p>
                </div>
                <button onClick={() => remindStale(s)} className="shrink-0 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg">⏰ Remind me</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Log a communication</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className="border rounded-lg px-3 py-2 text-sm" value={entityType} onChange={(e) => { setEntityType(e.target.value as any); setEntityId('') }}>
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
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Summary — what happened?" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <select className="border rounded-lg px-3 py-2 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {['call', 'email', 'sms', 'meeting', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {['talked', 'voicemail', 'left_message', 'no_answer', 'email_sent', 'email_replied', 'meeting_held', 'other'].map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
          <button onClick={log} disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {busy ? '…' : '+ Log'}
          </button>
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-gray-600">
          <input type="checkbox" checked={autoReschedule} onChange={(e) => setAutoReschedule(e.target.checked)} className="w-3.5 h-3.5" />
          Auto-schedule a call-back if the call goes unanswered
        </label>
      </div>

      {/* History */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Recent activity</h2>
        {comms.length === 0 ? (
          <p className="text-gray-400 text-sm">No communications logged yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {comms.slice(0, 50).map((c) => (
              <div key={c.id} className="py-3 flex items-start gap-3">
                <span className="text-lg shrink-0">{CHANNEL_ICONS[c.channel] || '📌'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className={`text-xs font-bold uppercase ${c.direction === 'outbound' ? 'text-blue-600' : 'text-green-600'}`}>{c.direction}</span>
                    {' '}{c.outcome.replace(/_/g, ' ')}
                    {c.contact_name && <span> — {c.contact_name}</span>}
                  </p>
                  {c.summary && <p className="text-xs text-gray-600 mt-0.5">{c.summary}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">{commLabel(c)} · {fmtTime(c.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
