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
import { Chip, DealCommandBar, EmptyState, GoldButton, SoftButton, PageHero } from '@/components/ui/premium'

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
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
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
        <div className="eyebrow mb-1">Expiration controls</div><h2 className="font-semibold mb-3">Set expiry date</h2>
        <DealCommandBar options={listings.map((listing) => { const [name, price] = listing.label.split(' — '); return { id: listing.id, name, askingPrice: price ? Number(price.replace(/[^0-9.]/g, '')) : null } })} value={selected} onChange={setSelected} />
        <div className="flex flex-col md:flex-row gap-3 mt-3">
          <input aria-label="Expiry date" className="border rounded-xl px-3 py-2 text-sm" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          <GoldButton onClick={setExpiryAction} disabled={busy}>Set expiry</GoldButton>
          <SoftButton onClick={() => act('process')} disabled={busy}>Run expiry check</SoftButton>
          <SoftButton onClick={proposeRenewals} disabled={busy}>📬 Send renewal proposals</SoftButton>
        </div>
      </div>

      <div className="p-card p-card-pad">
        <h2 className="font-semibold mb-3">Expiry records</h2>
        {records.length === 0 ? (
          <EmptyState icon="⏳" title="No expiry records" sub="Choose a listing above to begin monitoring its agreement term." />
        ) : (
          <div className="grid gap-3">
            {records.map((r) => {
              const isPast = r.status === 'active' && new Date(r.expires_at) < new Date()
              return (
                <div key={r.id} className="p-4 flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white shadow-sm">
                  <div>
                    <p className="text-sm font-medium">{r.listings?.business_name || 'Listing'}</p>
                    <p className="text-xs text-gray-500">
                      Expires {fmtDate(r.expires_at)} · <Chip tone={isPast ? 'red' : 'green'}>{isPast ? 'Past due' : r.status}</Chip>
                    </p>
                  </div>
                  {r.status === 'active' && (
                    <SoftButton
                      onClick={() => {
                        const days = prompt('Renew for how many days?', '90')
                        if (days) {
                          const d = new Date()
                          d.setDate(d.getDate() + Number(days))
                          act('renew', { listingId: r.listing_id, expiresAt: d.toISOString() })
                        }
                      }}
                    >
                      Renew
                    </SoftButton>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
