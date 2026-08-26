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
import { renderLoiHtml } from '@/lib/loiRender'
import { getStoredAccessToken } from '@/lib/authToken'

interface OfferOpt { id: string; label: string }
interface LoiRow {
  id: string
  offer_id: string | null
  status: string
  created_at: string
  content: Record<string, unknown> | null
  listings?: { business_name: string } | null
  deal_offers?: { purchase_price: number | null } | null
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function LoiPage() {
  return (
    <AppShell active="LOI Lab">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <LoiLab />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function LoiLab() {
  const toast = useToast()
  const [lois, setLois] = useState<LoiRow[]>([])
  const [offers, setOffers] = useState<OfferOpt[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const load = useCallback(async (agency: string) => {
    const token = getStoredAccessToken()
    const [loiRes, offerRes] = await Promise.all([
      fetch(`/api/loi?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/offers?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
    ])
    setLois(loiRes.lois || [])
    const accepted = (offerRes.offers || []).filter((o: any) => o.status === 'accepted')
    setOffers(
      accepted.map((o: any) => ({
        id: o.id,
        label: `${o.listings?.business_name || 'Listing'} — ${money(o.purchase_price)}`,
      })),
    )
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

  const generate = async () => {
    if (!selected) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/loi', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ offerId: selected }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Failed to generate LOI', 'error')
      return
    }
    toast('LOI generated', 'success')
    if (agencyId) await load(agencyId)
  }

  const openPreview = async (loi: LoiRow) => {
    // Render the REAL legal document (full HTML), not just the business name.
    if (loi.content && typeof loi.content === 'object' && Object.keys(loi.content).length > 0) {
      setPreview(renderLoiHtml(loi.content as any))
      return
    }
    setPreview(`<p>LOI content unavailable — regenerate from the accepted offer.</p>`)
  }

  const setStatus = async (loi: LoiRow, status: string) => {
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/loi', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ loiId: loi.id, status }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to update LOI', 'error')
    toast(`LOI marked ${status}`, 'success')
    if (agencyId) await load(agencyId)
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📝 LOI Generator</h1>
        <p className="text-gray-500 text-sm mt-1">
          One click from an accepted offer → professional Letter of Intent. Review, print, or send to the seller.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Generate from accepted offer</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <select
            className="border rounded-lg px-3 py-2 text-sm flex-1"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select an accepted offer…</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={!selected || busy}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
          >
            {busy ? 'Generating…' : 'Generate LOI'}
          </button>
        </div>
        {offers.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">No accepted offers yet — accept an offer in the Offer Lab first.</p>
        )}
      </div>

      {preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">LOI preview</h2>
            <button onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:underline">Close</button>
          </div>
          <iframe
            srcDoc={preview}
            title="LOI document"
            style={{ width: '100%', height: 560, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}
          />
          <p className="text-xs text-gray-400 mt-2">Use your browser's print (Ctrl/Cmd+P) to save as PDF.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Generated LOIs</h2>
        {lois.length === 0 ? (
          <p className="text-gray-400 text-sm">No LOIs yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {lois.map((loi) => {
              const content = loi.content as { business_name?: string; purchase_price?: number | null; buyer_name?: string } | null
              const ageHours = loi.created_at ? (Date.now() - new Date(loi.created_at).getTime()) / 3600000 : 0
              const needsNudge = ageHours >= 48 && !['signed', 'accepted', 'withdrawn'].includes(loi.status)
              return (
                <li key={loi.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{content?.business_name || loi.listings?.business_name || 'LOI'}</p>
                    <p className="text-xs text-gray-500">
                      {money(content?.purchase_price ?? loi.deal_offers?.purchase_price)} · {fmtDate(loi.created_at)} ·{' '}
                      <span className="capitalize">{loi.status}</span>
                    </p>
                    {needsNudge && (
                      <p className="text-xs mt-1" style={{ color: '#b45309' }}>
                        ⏰ No signature in 48h+ — follow up with the buyer
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => openPreview(loi)} className="text-xs text-blue-600 hover:underline">Preview</button>
                    {/* LOI lifecycle actions */}
                    {loi.status === 'draft' && (
                      <button onClick={() => setStatus(loi, 'sent')} disabled={busy} className="text-xs px-2 py-1 rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                        ✉️ Mark sent
                      </button>
                    )}
                    {loi.status === 'sent' && (
                      <button onClick={() => setStatus(loi, 'signed')} disabled={busy} className="text-xs px-2 py-1 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100">
                        ✍️ Mark signed
                      </button>
                    )}
                    {loi.status === 'signed' && (
                      <button onClick={() => setStatus(loi, 'accepted')} disabled={busy} className="text-xs px-2 py-1 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100">
                        ✅ Mark accepted
                      </button>
                    )}
                    {!['withdrawn', 'accepted'].includes(loi.status) && (
                      <button onClick={() => setStatus(loi, 'withdrawn')} disabled={busy} className="text-xs px-2 py-1 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100">
                        Withdraw
                      </button>
                    )}
                    {needsNudge && (
                      <button
                        onClick={() => {
                          const buyer = loi.content?.buyer_name || 'buyer'
                          const biz = loi.content?.business_name || loi.listings?.business_name || 'the deal'
                          window.location.href = `mailto:?subject=${encodeURIComponent('LOI signature needed — ' + biz)}&body=${encodeURIComponent('Hi ' + buyer + ',\n\nJust checking in on the LOI for ' + biz + ' — we\'d love your signature so we can move to diligence.\n\nBest,\nYour broker')}`
                        }}
                        className="text-xs px-2 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      >
                        🔔 Nudge
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
