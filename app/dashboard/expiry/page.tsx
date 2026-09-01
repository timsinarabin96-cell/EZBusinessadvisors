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
import { PageHero } from '@/components/ui/premium'

interface ExpiryRecord {
  id: string
  listing_id: string
  expires_at: string
  status: string
  listings?: { id: string; business_name: string | null; asking_price: number | null } | null
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function ExpiryPage() {
  return (
    <AppShell active="Listing Expiry">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <ExpiryTracker />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function ExpiryTracker() {
  const toast = useToast()
  const [records, setRecords] = useState<ExpiryRecord[]>([])
  const [listings, setListings] = useState<{ id: string; label: string }[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (agency: string) => {
    const token = getStoredAccessToken()
    const [recRes, optRes] = await Promise.all([
      fetch(`/api/listings/expiry?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/listings/options?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
    ])
    setRecords(recRes.records || [])
    setListings(optRes.listings || [])
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

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/listings/expiry', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action, agencyId, ...extra }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Action failed', 'error')
    toast('Done', 'success')
    if (agencyId) await load(agencyId)
  }

  const setExpiryAction = async () => {
    if (!selected || !expiresAt) return toast('Pick a listing and a date', 'error')
    await act('set', { listingId: selected, expiresAt: new Date(expiresAt).toISOString() })
    setSelected('')
    setExpiresAt('')
  }

  const proposeRenewals = async () => {
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/renewals', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'propose', agencyId }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Could not send proposals', 'error')
    toast(`Renewal proposals sent — ${data.proposed ?? 0} emailed, ${data.skipped ?? 0} skipped`, 'success')
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <PageHero
        icon="⏳"
        eyebrow="Listing Expiry"
        title="Listing Expiry & Renewal"
        sub="Set expiry dates, get 7-day reminders, and renew with one click."
      />

      <div className="p-card p-card-pad mb-6">
        <h2 className="font-semibold mb-3">Set expiry date</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <select className="border rounded-lg px-3 py-2 text-sm flex-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choose a listing…</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          <input className="border rounded-lg px-3 py-2 text-sm" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          <button onClick={setExpiryAction} disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg">
            Set expiry
          </button>
          <button onClick={() => act('process')} disabled={busy} className="bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg">
            Run expiry check
          </button>
          <button
            onClick={proposeRenewals}
            disabled={busy}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
            title="Email renewal proposals (refreshed valuation + one-click renew) for listings expiring in the next 30 days"
          >
            📬 Send renewal proposals
          </button>
        </div>
      </div>

      <div className="p-card p-card-pad">
        <h2 className="font-semibold mb-3">Expiry records</h2>
        {records.length === 0 ? (
          <p className="text-gray-400 text-sm">No expiry records yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {records.map((r) => {
              const isPast = r.status === 'active' && new Date(r.expires_at) < new Date()
              return (
                <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{r.listings?.business_name || 'Listing'}</p>
                    <p className="text-xs text-gray-500">
                      Expires {fmtDate(r.expires_at)} · <span className="capitalize">{r.status}</span>
                      {isPast && <span className="text-red-500 font-medium"> (past due)</span>}
                    </p>
                  </div>
                  {r.status === 'active' && (
                    <button
                      onClick={() => {
                        const days = prompt('Renew for how many days?', '90')
                        if (days) {
                          const d = new Date()
                          d.setDate(d.getDate() + Number(days))
                          act('renew', { listingId: r.listing_id, expiresAt: d.toISOString() })
                        }
                      }}
                      className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-3 py-1"
                    >
                      Renew
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
