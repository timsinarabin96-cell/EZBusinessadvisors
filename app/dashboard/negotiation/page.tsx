'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

interface OfferOpt {
  id: string
  label: string
}

interface CounterVariant {
  label: string
  price: number
  cash_at_closing: number
  seller_note: number
  diligence_days: number | null
  seller_value_score: number
  rationale: string
}

interface DraftRow {
  id: string
  offer_id: string | null
  draft_type: string
  html: string | null
  created_at: string
  content?: { variants?: CounterVariant[]; offer?: { business_name?: string; original_score?: number } }
  listings?: { business_name: string } | null
  deal_offers?: { purchase_price: number | null; status: string | null } | null
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function NegotiationPage() {
  return (
    <AppShell active="Negotiation Assistant">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <NegotiationAssistant />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function NegotiationAssistant() {
  const toast = useToast()
  const [offers, setOffers] = useState<OfferOpt[]>([])
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [selected, setSelected] = useState('')
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<DraftRow | null>(null)

  const load = useCallback(async (agency: string) => {
    const token = getStoredAccessToken()
    const [offerRes, draftRes] = await Promise.all([
      fetch(`/api/offers?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/intelligence/negotiation?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } }).then((r) =>
        r.json().catch(() => ({})),
      ),
    ])
    setOffers(
      (offerRes.offers || []).map((o: any) => ({
        id: o.id,
        label: `${o.listings?.business_name || 'Listing'} — ${money(o.purchase_price)} (${o.status || 'draft'})`,
      })),
    )
    setDrafts(draftRes.drafts || [])
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) {
        setLoading(false)
        return
      }
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
    const res = await fetch('/api/intelligence/negotiation', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ offerId: selected, instructions: instructions.trim() || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) {
      toast(data.error || 'Failed to generate strategy', 'error')
      return
    }
    toast('Counter-offer strategy generated', 'success')
    if (agencyId) await load(agencyId)
  }

  const printDraft = (draft: DraftRow) => {
    if (draft.html) {
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(draft.html)
        win.document.close()
        win.focus()
        win.print()
        return
      }
    }
    window.print()
  }

  // --- BATNA guidance: walk-away zone from the original seller score ---
  const batnaFor = (draft: DraftRow) => {
    const score = draft.content?.offer?.original_score ?? 50
    if (score >= 70) return { zone: 'Sellers may hold firm — prepare a strong walk-away floor', color: '#b91c1c', floor: 'Keep price within 5% of ask' }
    if (score >= 45) return { zone: 'Balanced — push for a middle band and flexible terms', color: '#b45309', floor: 'Target 5–10% below ask' }
    return { zone: 'Buyer-friendly — anchor low and protect your walk-away', color: '#15803d', floor: 'Anchor 10%+ below ask' }
  }

  const timeline = [...drafts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🧭 AI Negotiation Assistant</h1>
        <p className="text-gray-500 text-sm mt-1">
          Pick an Offer Lab offer and get three counter-offer strategies — price bump, cash/seller-note mix, diligence flexibility — each with rationale.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Generate counter-offer strategy</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <select className="border rounded-lg px-3 py-2 text-sm flex-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select an offer…</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <input
          className="border rounded-lg px-3 py-2 text-sm w-full mt-3"
          placeholder="Optional instructions for the strategy (e.g. 'Seller is price-sensitive, keep any bump under 3%')"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <button
          onClick={generate}
          disabled={!selected || busy}
          className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
        >
          {busy ? 'Generating…' : 'Generate strategy'}
        </button>
        {offers.length === 0 && (
          <p className="text-xs text-gray-400 mt-2">No offers yet — create one in the Offer Lab first.</p>
        )}
      </div>

      {/* Latest draft variants */}
      {preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Strategy preview</h2>
            <div className="flex items-center gap-3">
              <button onClick={() => printDraft(preview)} className="text-xs text-blue-600 hover:underline">
                Print / PDF
              </button>
              <button onClick={() => setPreview(null)} className="text-xs text-gray-400 hover:underline">
                Close
              </button>
            </div>
          </div>
          {preview.html ? (
            <iframe title="Negotiation draft" srcDoc={preview.html} className="w-full border border-gray-200 rounded-lg" style={{ height: 480 }} />
          ) : (
            <p className="text-gray-400 text-sm">No HTML preview available.</p>
          )}
        </div>
      )}

      {/* Negotiation timeline + BATNA guidance (audit A2) */}
      {timeline.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold mb-4">🧭 Negotiation timeline</h2>
          <div style={{ position: 'relative', paddingLeft: 22 }}>
            <div style={{ position: 'absolute', left: 7, top: 4, bottom: 4, width: 2, background: '#e2e8f0' }} />
            {timeline.map((draft, i) => {
              const batna = batnaFor(draft)
              return (
                <div key={draft.id} style={{ position: 'relative', marginBottom: 18 }}>
                  <div style={{ position: 'absolute', left: -21, top: 4, width: 12, height: 12, borderRadius: 99, background: i === timeline.length - 1 ? '#2563eb' : '#94a3b8', border: '2px solid #fff' }} />
                  <p className="text-sm font-semibold text-gray-800">
                    Round {i + 1} — {draft.content?.offer?.business_name || draft.listings?.business_name || 'Offer'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {fmtDate(draft.created_at)} · {money(draft.deal_offers?.purchase_price)} · <span className="capitalize">{draft.draft_type}</span>
                  </p>
                  <div style={{ marginTop: 6, padding: '8px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #eef2f7' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: batna.color }}>BATNA: {batna.zone}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>· {batna.floor}</span>
                  </div>
                  <button onClick={() => setPreview(draft)} className="text-xs text-blue-600 hover:underline mt-2">
                    View this round →
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Generated strategies</h2>
        {drafts.length === 0 ? (
          <p className="text-gray-400 text-sm">No strategies yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {drafts.map((draft) => {
              const variants = draft.content?.variants || []
              return (
                <li key={draft.id} className="py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{draft.content?.offer?.business_name || draft.listings?.business_name || 'Offer'}</p>
                      <p className="text-xs text-gray-500">
                        {money(draft.deal_offers?.purchase_price)} · {fmtDate(draft.created_at)} ·{' '}
                        <span className="capitalize">{draft.draft_type}</span> · original score {draft.content?.offer?.original_score ?? '—'}/100
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setPreview(draft)} className="text-xs text-blue-600 hover:underline">
                        Preview
                      </button>
                      <button onClick={() => printDraft(draft)} className="text-xs text-blue-600 hover:underline">
                        Print
                      </button>
                    </div>
                  </div>
                  {variants.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                      {variants.map((v, i) => (
                        <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                          <p className="text-xs font-semibold text-gray-700">
                            Option {i + 1} — {v.label}
                          </p>
                          <p className="text-sm mt-1">
                            {money(v.price)} · {money(v.cash_at_closing)} cash · {money(v.seller_note)} note
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Diligence {v.diligence_days ?? 45}d · seller score {v.seller_value_score}/100
                          </p>
                          <p className="text-xs text-gray-500 mt-1">{v.rationale}</p>
                        </div>
                      ))}
                    </div>
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
