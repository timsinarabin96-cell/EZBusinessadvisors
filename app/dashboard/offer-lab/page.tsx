'use client'

// =============================================================================
// Deal Offer Lab — build, score, and manage buyer offers.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import MoneyInput from '@/components/ui/MoneyInput'

interface OfferRow {
  id: string
  listing_id: string
  status: string
  purchase_price: number | null
  cash_at_closing: number | null
  seller_note: number | null
  earnout_amount: number | null
  seller_value_score: number | null
  closing_probability: number | null
  created_at: string | null
  listings?: { business_name: string; asking_price: number | null } | null
  buyer_leads?: { full_name: string; company: string | null } | null
}

interface ListingOpt { id: string; label: string }

export default function OfferLabPage() {
  return (
    <AppShell active="Offer Lab">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <OfferLab />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function OfferLab() {
  const toast = useToast()
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [listings, setListings] = useState<ListingOpt[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    listing_id: '', purchase_price: '', cash_at_closing: '', seller_note: '',
    earnout_amount: '', diligence_days: '45', training_days: '30', financing_contingency: false,
  })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const ctx = await getAgencyContext()
    if (!ctx) { setLoading(false); return }
    setAgencyId(ctx.agencyId)
    const [offersRes, listingsRes] = await Promise.all([
      fetch(`/api/offers?agencyId=${ctx.agencyId}`).then((r) => r.json().catch(() => ({}))),
      fetch('/api/listings/options').then((r) => r.json().catch(() => ({}))),
    ])
    if (offersRes.ok) setOffers(offersRes.offers || [])
    if (listingsRes.ok) setListings(listingsRes.listings || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.listing_id) return toast('Select a listing', 'error')
    setBusy(true)
    const res = await fetch('/api/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listing_id: form.listing_id,
        purchase_price: form.purchase_price ? Number(String(form.purchase_price).replace(/[$,]/g, '')) : null,
        cash_at_closing: form.cash_at_closing ? Number(String(form.cash_at_closing).replace(/[$,]/g, '')) : null,
        seller_note: form.seller_note ? Number(String(form.seller_note).replace(/[$,]/g, '')) : null,
        earnout_amount: form.earnout_amount ? Number(String(form.earnout_amount).replace(/[$,]/g, '')) : null,
        diligence_days: form.diligence_days ? Number(form.diligence_days) : null,
        training_days: form.training_days ? Number(form.training_days) : null,
        financing_contingency: form.financing_contingency,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast(data.error || 'Failed to create offer', 'error')
    setForm({ ...form, listing_id: '', purchase_price: '', cash_at_closing: '', seller_note: '', earnout_amount: '' })
    toast('Offer drafted in the lab.', 'success')
    load()
  }

  const setStatus = async (offerId: string, status: string) => {
    const res = await fetch('/api/offers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerId, status }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast(data.error || 'Action failed', 'error')
    toast(`Offer ${status}.`, 'success')
    load()
  }

  if (loading) return <LoadingState label="Loading offer lab..." />

  return (
    <div>
      <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>Deal Offer Lab</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 24px' }}>
        Draft offers, get an instant seller-value score, and move them through submission → acceptance.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,340px) minmax(0,1fr)', gap: 24 }} className="buyer-profile-grid">
        <form onSubmit={create} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>New Offer</h2>
          <label><span className="label">Listing *</span>
            <select className="select" value={form.listing_id} onChange={(e) => setForm({ ...form, listing_id: e.target.value })}>
              <option value="">Select…</option>
              {listings.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <label><span className="label">Purchase price ($)</span><MoneyInput value={form.purchase_price} onChange={(v) => setForm({ ...form, purchase_price: v })} /></label>
          <label><span className="label">Cash at closing ($)</span><MoneyInput value={form.cash_at_closing} onChange={(v) => setForm({ ...form, cash_at_closing: v })} /></label>
          <label><span className="label">Seller note ($)</span><MoneyInput value={form.seller_note} onChange={(v) => setForm({ ...form, seller_note: v })} /></label>
          <label><span className="label">Earnout ($)</span><MoneyInput value={form.earnout_amount} onChange={(v) => setForm({ ...form, earnout_amount: v })} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label><span className="label">Diligence days</span><input className="input" type="number" value={form.diligence_days} onChange={(e) => setForm({ ...form, diligence_days: e.target.value })} /></label>
            <label><span className="label">Training days</span><input className="input" type="number" value={form.training_days} onChange={(e) => setForm({ ...form, training_days: e.target.value })} /></label>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.financing_contingency} onChange={(e) => setForm({ ...form, financing_contingency: e.target.checked })} />
            Financing contingency
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Drafting…' : 'Draft Offer'}</button>
        </form>

        <section>
          <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>Offers ({offers.length})</h2>
          {offers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--muted)' }}>
              No offers yet — draft your first one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {offers.map((o) => (
                <article key={o.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <strong>{o.listings?.business_name || 'Listing'}</strong>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {o.buyer_leads?.full_name || 'Buyer'} · ${Number(o.purchase_price || 0).toLocaleString()}
                        {o.cash_at_closing ? ` · $${Number(o.cash_at_closing).toLocaleString()} cash` : ''}
                      </div>
                    </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, background: o.seller_value_score && o.seller_value_score >= 60 ? '#ecfdf5' : '#fef3c7', color: o.seller_value_score && o.seller_value_score >= 60 ? '#065f46' : '#92400e', padding: '3px 10px', borderRadius: 20 }}>
                        Seller value: {o.seller_value_score ?? '—'}/100
                      </span>
                      <span style={{ fontSize: 11, background: '#f1f5f9', padding: '3px 10px', borderRadius: 20 }}>{o.status}</span>
                    </div>
                  </div>
                  {/* Deal structure comparison — cash vs seller note vs financed */}
                  {(() => {
                    const price = Number(o.purchase_price || 0)
                    const cash = Number(o.cash_at_closing || 0)
                    const note = Number(o.seller_note || 0)
                    const financed = Math.max(price - cash - note, 0)
                    const segments = [
                      { label: 'Cash at closing', value: cash, color: '#15803d' },
                      { label: 'Seller note', value: note, color: '#d97706' },
                      { label: 'Bank / SBA financed', value: financed, color: '#2563eb' },
                    ].filter((s) => s.value > 0)
                    if (price > 0 && segments.length > 0) {
                      return (
                        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #eef2f7' }}>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
                            {segments.map((s) => (
                              <span key={s.label} style={{ fontSize: 11.5, color: '#475569' }}>
                                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: s.color, marginRight: 5 }} />
                                {s.label}: <strong style={{ color: '#0f172a' }}>${s.value.toLocaleString()}</strong> <span style={{ color: '#94a3b8' }}>({Math.round((s.value / price) * 100)}%)</span>
                              </span>
                            ))}
                          </div>
                          <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', background: '#e2e8f0' }}>
                            {segments.map((s) => (
                              <div key={s.label} style={{ width: `${(s.value / price) * 100}%`, background: s.color }} />
                            ))}
                          </div>
                        </div>
                      )
                    }
                    return null
                  })()}
                  {o.status === 'draft' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setStatus(o.id, 'submitted')}>Submit to seller</button>
                      <button className="btn" style={{ padding: '5px 12px', fontSize: 12, color: '#b91c1c' }} onClick={() => setStatus(o.id, 'withdrawn')}>Withdraw</button>
                    </div>
                  )}
                  {o.status === 'submitted' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setStatus(o.id, 'accepted')}>Accept</button>
                      <button className="btn" style={{ padding: '5px 12px', fontSize: 12, color: '#b91c1c' }} onClick={() => setStatus(o.id, 'rejected')}>Reject</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
