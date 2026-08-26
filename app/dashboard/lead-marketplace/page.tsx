/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { formatWithCommas } from '@/components/ui/MoneyInput'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'
import { LEAD_TIERS, type LeadTier } from '@/lib/leadMarketplace'

interface MarketLead {
  id: string
  seller_agency_id: string
  seller_agency_name: string | null
  lead_id: string
  industry: string | null
  location: string | null
  budget: string | null
  funds: string | null
  headline: string
  price_cents: number
  status: 'listed' | 'sold'
  created_at: string
}

interface MarketPurchase {
  id: string
  listing_id: string
  lead_id: string
  seller_agency_id: string
  buyer_agency_id: string
  price_cents: number
  status: string
  created_at: string
}

interface MyListing extends MarketLead {}

const money = (cents: number) => '$' + (cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '—')

export default function LeadMarketplacePage() {
  return (
    <AppShell active="Lead Marketplace">
      <ToastProvider>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 60px' }}>
          <LeadMarketplaceApp />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function LeadMarketplaceApp() {
  const toast = useToast()
  const [agencyId, setAgencyId] = useState('')
  const [tab, setTab] = useState<'browse' | 'mine' | 'purchases'>('browse')
  const [browse, setBrowse] = useState<MarketLead[]>([])
  const [mine, setMine] = useState<MyListing[]>([])
  const [purchases, setPurchases] = useState<MarketPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Publish form
  const [leadId, setLeadId] = useState('')
  const [headline, setHeadline] = useState('')
  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('')
  const [budget, setBudget] = useState('')
  const [funds, setFunds] = useState('')
  const [priceDollars, setPriceDollars] = useState('')
  const [selectedTier, setSelectedTier] = useState<'standard' | 'premium' | 'elite'>('standard')

  const token = () => getStoredAccessToken()

  const load = useCallback(async (agency: string) => {
    const [b, m, p] = await Promise.all([
      fetch('/api/lead-marketplace?view=browse', { headers: { authorization: `Bearer ${token()}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/lead-marketplace?view=mine&agencyId=${agency}`, { headers: { authorization: `Bearer ${token()}` } }).then((r) => r.json().catch(() => ({}))),
      fetch(`/api/lead-marketplace?view=purchases&agencyId=${agency}`, { headers: { authorization: `Bearer ${token()}` } }).then((r) => r.json().catch(() => ({}))),
    ])
    setBrowse(b.leads || [])
    setMine(m.listings || [])
    setPurchases(p.purchases || [])
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

  const publish = async () => {
    if (!leadId || !priceDollars) { toast('Pick a lead and set a price', 'error'); return }
    setBusy(true)
    const res = await fetch('/api/lead-marketplace', {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'publish', agencyId, leadId,
        headline: headline || undefined, industry: industry || undefined,
        location: location || undefined, budget: budget || undefined, funds: funds || undefined,
        tier: selectedTier,
        priceCents: Math.round(Number(String(priceDollars).replace(/[$,]/g, '')) * 100),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) { toast(data.error || 'Could not publish', 'error'); return }
    toast('Lead listed for sale ✅', 'success')
    setLeadId(''); setHeadline(''); setIndustry(''); setLocation(''); setBudget(''); setFunds(''); setPriceDollars('')
    if (agencyId) await load(agencyId)
    setTab('mine')
  }

  const withdraw = async (listingId: string) => {
    if (!confirm('Withdraw this lead from the marketplace?')) return
    const res = await fetch('/api/lead-marketplace', {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'withdraw', listingId, agencyId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) { toast(data.error || 'Could not withdraw', 'error'); return }
    toast('Listing withdrawn', 'success')
    if (agencyId) await load(agencyId)
  }

  const buy = async (listing: MarketLead) => {
    if (!confirm(`Buy this lead for ${money(listing.price_cents)}? You'll get the buyer's contact details immediately.`)) return
    setBusy(true)
    const res = await fetch('/api/lead-marketplace', {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'buy', listingId: listing.id, agencyId }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) { toast(data.error || 'Could not buy', 'error'); return }
    const lead = data.lead
    if (lead?.full_name || lead?.email || lead?.phone) {
      toast(`Lead purchased — ${lead.full_name || ''} ${lead.email || ''} ${lead.phone || ''}`.trim(), 'success')
    } else {
      toast('Lead purchased ✅', 'success')
    }
    if (agencyId) await load(agencyId)
    setTab('purchases')
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🤝 Lead Marketplace</h1>
        <p className="text-gray-500 text-sm mt-1">
          Buy and sell qualified buyer leads between agencies. Publish your excess leads, buy ready buyers for your listings — every transaction is ledgered.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {([
          ['browse', `Browse (${browse.length})`],
          ['mine', `My listings (${mine.length})`],
          ['purchases', `Purchases (${purchases.length})`],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: '8px 18px', borderRadius: 99, border: '1px solid var(--line)', cursor: 'pointer',
              fontWeight: 700, fontSize: 13.5, background: tab === id ? 'var(--navy)' : '#fff',
              color: tab === id ? '#fff' : 'var(--ink)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <>
          {browse.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--muted)' }}>
              No leads listed for sale yet. List one from the "My listings" tab — or check back soon.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {browse.map((l) => (
                <div key={l.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{l.headline}</div>
                    <span style={{ fontSize: 12, background: '#f1f5f9', padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap', color: '#334155' }}>{l.seller_agency_name || 'Another agency'}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {l.industry && <span>🏭 {l.industry}</span>}
                    {l.location && <span>📍 {l.location}</span>}
                    {l.budget && <span>💰 {l.budget}</span>}
                    {l.funds && <span>💵 {l.funds}</span>}
                    <span>🕐 Listed {fmtDate(l.created_at)}</span>
                  </div>
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                    <strong style={{ fontSize: 18, color: 'var(--navy)' }}>{money(l.price_cents)}</strong>
                    <button className="btn btn-primary" onClick={() => buy(l)} disabled={busy} style={{ padding: '7px 16px', fontSize: 13 }}>Buy lead</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'mine' && (
        <>
          {/* Publish form */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', margin: '0 0 12px' }}>Publish a buyer lead for sale</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <input style={inputStyle} placeholder="Buyer lead ID (from Lead Management)" value={leadId} onChange={(e) => setLeadId(e.target.value)} />
              <input style={inputStyle} placeholder="Headline (anonymized)" value={headline} onChange={(e) => setHeadline(e.target.value)} />
              <input style={inputStyle} placeholder="Industry wanted" value={industry} onChange={(e) => setIndustry(e.target.value)} />
              <input style={inputStyle} placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
              <input style={inputStyle} placeholder="Budget range" value={budget} onChange={(e) => setBudget(e.target.value)} />
              <input style={inputStyle} placeholder="Funds available" value={funds} onChange={(e) => setFunds(e.target.value)} />
              <input style={inputStyle} placeholder="Price ($)" inputMode="decimal" value={priceDollars} onChange={(e) => setPriceDollars(formatWithCommas(e.target.value))} />
              <select style={{ ...inputStyle, marginTop: 8 }} value={selectedTier} onChange={(e) => setSelectedTier(e.target.value as 'standard' | 'premium' | 'elite')}>
                {LEAD_TIERS.map((t) => (
                  <option key={t.id} value={t.id}>{t.icon} {t.label} — ${t.suggestedMin}–${t.suggestedMax} ({(100 - t.platformFeePct)}% yours)</option>
                ))}
              </select>
            </div>
            <button onClick={publish} disabled={busy} className="btn btn-primary" style={{ marginTop: 12 }}>{busy ? 'Publishing…' : '📤 List lead for sale'}</button>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Buyers see the teaser only — contact details are released at purchase. Never include the buyer's name or contact info in the headline.</p>
          </div>

          {mine.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--muted)' }}>
              You haven't listed any leads yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {mine.map((l) => (
                <div key={l.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--navy)' }}>{l.headline}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>
                    {l.industry && <span>🏭 {l.industry} · </span>}
                    {l.location && <span>📍 {l.location}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{money(l.price_cents)}</span>
                    <span style={{ fontSize: 11.5, background: l.status === 'sold' ? '#ecfdf5' : '#fef3c7', color: l.status === 'sold' ? '#065f46' : '#92400e', padding: '3px 10px', borderRadius: 20 }}>
                      {l.status}
                    </span>
                  </div>
                  {l.status === 'listed' && (
                    <button className="btn" style={{ marginTop: 10, width: '100%', color: '#b91c1c' }} onClick={() => withdraw(l.id)}>Withdraw</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'purchases' && (
        purchases.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--muted)' }}>
            No purchases yet. Buy a lead from the Browse tab and it lands here with the full contact details.
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            {purchases.map((p) => (
              <div key={p.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16 }}>🎯</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--navy)' }}>{money(p.price_cents)} · lead {p.lead_id.slice(0, 8)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Purchased {fmtDate(p.created_at)} · {p.status}</div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13.5, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
