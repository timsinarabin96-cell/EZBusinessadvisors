/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'
import { useToast } from '@/components/ui/Toast'

interface ReportOrder {
  id: string
  tier: string
  status: string
  amount_cents: number | null
  report_url: string | null
  paid_at: string | null
  created_at: string
  listings?: { id?: string; business_name?: string | null; asking_price?: number | null; industry?: string | null } | null
}

interface ListingOpt { id: string; label: string }

const TIERS = [
  { id: 'standard', name: 'Valuation Report', price: 199, blurb: 'Full financial recast, valuation range, and broker-grade summary.' },
  { id: 'full_bov', name: 'Full BOV + Teaser', price: 499, blurb: 'Everything in Standard, plus an expanded Broker Opinion of Value and a marketing-ready teaser.' },
] as const

const money = (n: number | null | undefined) => (n != null ? '$' + Number(n).toLocaleString() : '—')
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '—')

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending payment' },
  ready: { bg: '#ecfdf5', color: '#065f46', label: 'Ready to deliver' },
  paid: { bg: '#dbeafe', color: '#1e40af', label: 'Paid' },
  failed: { bg: '#fee2e2', color: '#991b1b', label: 'Generation failed' },
}

export function ValuationReportsApp() {
  const toast = useToast()
  const [agencyId, setAgencyId] = useState('')
  const [listings, setListings] = useState<ListingOpt[]>([])
  const [reports, setReports] = useState<ReportOrder[]>([])
  const [listingId, setListingId] = useState('')
  const [tier, setTier] = useState<string>('standard')
  const [sellerEmail, setSellerEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (agency: string) => {
    const token = getStoredAccessToken()
    const [listingRes, reportRes] = await Promise.all([
      fetch(`/api/listings/options?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/valuation-reports?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
    ])
    setListings(listingRes.listings || [])
    setReports(reportRes.reports || [])
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

  const order = async () => {
    if (!listingId) { toast('Pick a listing first', 'error'); return }
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/valuation-reports', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ agencyId, listingId, tier, email: sellerEmail || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) { toast(data.error || 'Could not create report order', 'error'); return }
    if (data.mode === 'stripe' && data.url) {
      window.location.href = data.url
      return
    }
    toast('Report generated — ready to deliver 🎉', 'success')
    setListingId('')
    if (agencyId) await load(agencyId)
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">💎 Sellable Valuation Reports</h1>
        <p className="text-gray-500 text-sm mt-1">
          The data product — generate a broker-grade valuation report for a listing and sell it to the seller ($199–$499). Live market comps, recast context, and an indicated value range in a branded PDF.
        </p>
      </div>

      {/* Order form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Create a report order</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select className="border rounded-lg px-3 py-2 text-sm" value={listingId} onChange={(e) => setListingId(e.target.value)}>
            <option value="">Pick a listing…</option>
            {listings.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={tier} onChange={(e) => setTier(e.target.value)}>
            {TIERS.map((t) => <option key={t.id} value={t.id}>{t.name} — ${t.price}</option>)}
          </select>
          <input className="border rounded-lg px-3 py-2 text-sm md:col-span-2" placeholder="Seller email (for the Stripe checkout link)" value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button onClick={order} disabled={busy || !listingId} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {busy ? 'Working…' : '💳 Create order + checkout'}
          </button>
          <span className="text-xs text-gray-400">No Stripe keys? Demo mode generates the PDF instantly.</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {TIERS.map((t) => (
            <div key={t.id} className="border rounded-lg p-3 bg-gray-50">
              <div className="font-semibold text-sm">{t.name} — ${t.price}</div>
              <div className="text-xs text-gray-500 mt-1">{t.blurb}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Order history */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Report orders ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="text-gray-400 text-sm">No orders yet. Create your first sellable report above.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {reports.map((r) => {
              const badge = STATUS_BADGE[r.status] || { bg: '#f1f5f9', color: '#475569', label: r.status }
              const tierMeta = TIERS.find((t) => t.id === r.tier)
              return (
                <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">
                      {r.listings?.business_name || 'Listing'} · {tierMeta?.name || r.tier}
                    </p>
                    <p className="text-xs text-gray-500">
                      {money(r.amount_cents ? r.amount_cents / 100 : null)} · {fmtDate(r.created_at)}
                      {r.listings?.industry ? ` · ${r.listings.industry}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs border rounded-full px-2 py-0.5" style={{ background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                    {r.report_url && (
                      <a href={r.report_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 font-medium border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                        ⬇ PDF
                      </a>
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
