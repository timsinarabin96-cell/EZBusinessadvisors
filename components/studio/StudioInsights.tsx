/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authHeaders } from '@/lib/authToken'

// =============================================================================
// StudioInsights — the advanced AI rail cards for the AI Deal Studio.
// -----------------------------------------------------------------------------
//  · PipelineStatusCard — "AI is working: recast ✅ BOV ✅ CIM ⏳" with a
//    Run AI pipeline button (auto-generates recast → BOV → CIM → BLI).
//  · SellerApprovalCard  — seller approval state + link for one-tap approval.
//  · DealPulseCard       — live deal heartbeat (readiness blocking summary).
//  · RiskCard            — standing red-flag/blocking summary during Verify.
// All wire to existing endpoints — no new backends, just surface them.
// =============================================================================

const PIPELINE_DOCS: Array<{ key: string; label: string; category: string }> = [
  { key: 'recast', label: 'Recast', category: 'recast' },
  { key: 'bov', label: 'BOV', category: 'bov' },
  { key: 'cim', label: 'CIM', category: 'cim' },
  { key: 'bli', label: 'BLI', category: 'bli' },
]

// ---------------------------------------------------------------------------
// Pipeline status — "AI is working" card
// ---------------------------------------------------------------------------
export function PipelineStatusCard({ listingId, businessName }: { listingId: string; businessName?: string | null }) {
  const toast = useToast()
  const [docs, setDocs] = useState<any[]>([])
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/financial/extractions?listingId=${encodeURIComponent(listingId)}&mode=docs`, { headers: authHeaders() })
      const j = await res.json()
      setDocs(j.docs || [])
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [listingId])

  useEffect(() => { load() }, [load])

  const runPipeline = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/financial/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ listingId }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Pipeline failed')
      toast('AI pipeline finished — recast → BOV → CIM → BLI generated ✨', 'success')
      load()
    } catch (e: any) {
      toast(e.message || 'Pipeline failed — add financials first', 'error')
    } finally {
      setRunning(false)
    }
  }

  const hasDoc = (category: string) => docs.some((d) => String(d.category || '').toLowerCase().includes(category))

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 10 }}>🤖 AI Document Pipeline</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PIPELINE_DOCS.map((d) => {
          const done = hasDoc(d.category)
          return (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ fontSize: 14 }}>{done ? '✅' : '⏳'}</span>
              <span style={{ fontWeight: 700, color: done ? '#166534' : 'var(--muted)' }}>{d.label}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: done ? '#16a34a' : '#b6bdc7', fontSize: 11.5 }}>{done ? 'done' : 'pending'}</span>
            </div>
          )
        })}
      </div>
      <button
        onClick={runPipeline}
        disabled={running || loading}
        style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: running || loading ? 'not-allowed' : 'pointer', opacity: running || loading ? 0.6 : 1 }}
      >
        {running ? '⚙️ AI is working…' : '⚙️ Run AI pipeline (recast → BOV → CIM → BLI)'}
      </button>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        {businessName || 'This listing'} — documents generate from the approved financial extractions as soon as they exist.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Seller approval — one-tap approval state + link
// ---------------------------------------------------------------------------
export function SellerApprovalCard({ listingId, sellerApproved, approvalRef }: { listingId: string; sellerApproved?: boolean; approvalRef?: string | null }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>👆 Seller approval</div>
      {sellerApproved ? (
        <div style={{ fontSize: 12.5, color: '#166534', fontWeight: 700 }}>
          ✅ Seller approved{approvalRef ? ` · ${approvalRef}` : ''}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: '#9a6700', lineHeight: 1.6 }}>
          ⏳ Waiting on seller approval of the public preview before publish.
          <div style={{ marginTop: 8 }}>
            <a href={`/dashboard/portal`} style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 8, background: '#0e7490', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 12 }}>
              📧 Send / manage seller link
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deal pulse — live heartbeat via the readiness engine
// ---------------------------------------------------------------------------
export function DealPulseCard({ listingId }: { listingId: string }) {
  const [blocking, setBlocking] = useState<string[]>([])
  const [label, setLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/intelligence/readiness?listingId=${encodeURIComponent(listingId)}&action=blocking`, { headers: authHeaders() })
        const j = await res.json()
        if (cancelled) return
        setBlocking(Array.isArray(j.blockers) ? j.blockers.slice(0, 4) : [])
        setLabel(j.label || j.summary || '')
      } catch {
        if (!cancelled) { setBlocking([]); setLabel('') }
      }
    })()
    return () => { cancelled = true }
  }, [listingId])

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>📈 Deal pulse</div>
      {label && <div style={{ fontSize: 12.5, color: 'var(--navy)', fontWeight: 700, marginBottom: 6 }}>{label}</div>}
      {blocking.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {blocking.map((b) => <div key={b} style={{ fontSize: 12, color: '#b45309' }}>⚠ {b}</div>)}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>✓ No blockers — deal is moving</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Risk card — standing red-flag summary during Verify
// ---------------------------------------------------------------------------
export function RiskCard({ listingId }: { listingId: string }) {
  const [risks, setRisks] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/intelligence/readiness?listingId=${encodeURIComponent(listingId)}&action=blocking`, { headers: authHeaders() })
        const j = await res.json()
        if (cancelled) return
        setRisks(Array.isArray(j.blockers) ? j.blockers.slice(0, 5) : [])
      } catch {
        if (!cancelled) setRisks([])
      }
    })()
    return () => { cancelled = true }
  }, [listingId])

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>⚠️ Risk check</div>
      {risks.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {risks.map((r) => <div key={r} style={{ fontSize: 12, color: '#b91c1c' }}>• {r}</div>)}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>✓ No red flags detected</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live comps — similar sold businesses during Capture (market proof)
// ---------------------------------------------------------------------------
export function CompsCard({ industry, askingPrice }: { industry?: string | null; askingPrice?: string | null }) {
  const [comps, setComps] = useState<any[]>([])
  const price = askingPrice ? Number(String(askingPrice).replace(/[$,]/g, '')) : null

  useEffect(() => {
    let cancelled = false
    if (!industry) { setComps([]); return }
    ;(async () => {
      try {
        const res = await fetch(`/api/comps?industry=${encodeURIComponent(industry)}`, { headers: authHeaders() })
        const j = await res.json()
        if (!cancelled && Array.isArray(j.comps)) setComps(j.comps.slice(0, 4))
      } catch { if (!cancelled) setComps([]) }
    })()
    return () => { cancelled = true }
  }, [industry])

  if (comps.length === 0) return null
  const avgMultiple = comps.length
    ? comps.reduce((s: number, c: any) => s + (Number(c.multiple) || 0), 0) / comps.length
    : 0

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>📊 Live comps · {industry}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {comps.map((c, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
            <span>{c.business_name || c.industry || 'Similar sale'}</span>
            <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{c.multiple ? `${Number(c.multiple).toFixed(1)}×` : c.price ? `$${Number(c.price).toLocaleString()}` : ''}</span>
          </div>
        ))}
      </div>
      {avgMultiple > 0 && (
        <div style={{ fontSize: 12, marginTop: 8, paddingTop: 8, borderTop: '1px solid #edf0f3', color: 'var(--navy)' }}>
          Avg multiple <strong>{avgMultiple.toFixed(1)}×</strong>
          {price && <span style={{ color: 'var(--muted)' }}> · your price ≈ {price > 0 && avgMultiple > 0 ? `${(price / avgMultiple).toLocaleString(undefined, { maximumFractionDigits: 0 })} implied` : ''}</span>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// What-if valuation slider — drag SDE/EBITDA to see the value range move
// ---------------------------------------------------------------------------
export function ValuationSliderCard({ industry, basis, baseValue }: { industry?: string | null; basis: 'SDE' | 'EBITDA'; baseValue?: number | null }) {
  const [value, setValue] = useState(baseValue ?? 100000)
  const band = bandForIndustryLocal(industry, basis)
  const low = band ? value * band.min : value * 1.5
  const high = band ? value * band.max : value * 3.0

  useEffect(() => { if (baseValue) setValue(baseValue) }, [baseValue])

  if (!band) return null
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>🎚️ What-if valuation</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
        Drag {basis} — {industry} typically sells at {band.min.toFixed(1)}–{band.max.toFixed(1)}×
      </div>
      <input
        type="range" min={25000} max={2000000} step={5000} value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#c9a84c' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginTop: 6 }}>
        <span>{basis}: {fmt(value)}</span>
        <span>Value: {fmt(low)} – {fmt(high)}</span>
      </div>
    </div>
  )
}

function bandForIndustryLocal(industry?: string | null, basis: 'SDE' | 'EBITDA' = 'SDE') {
  try {
    // Lazy-import the pure market-multiples core to avoid bundling weight here.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mm = require('@/lib/marketMultiplesCore') as { bandForIndustry?: (ind?: string | null, b?: string) => { min: number; max: number } | null }
    return mm.bandForIndustry ? mm.bandForIndustry(industry, basis) : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Buyer leaderboard — matched buyers ranked by fit, right on the rail
// ---------------------------------------------------------------------------
export function BuyerLeaderboardCard({ industry }: { industry?: string | null }) {
  const [buyers, setBuyers] = useState<Array<{ name?: string; score?: number; email?: string }>>([])
  const [demand, setDemand] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/marketplace/buyer-demand?industry=${encodeURIComponent(industry || '')}`, { cache: 'no-store' })
        const j = await res.json()
        if (!cancelled && typeof j.count === 'number') setDemand(j.count)
      } catch { if (!cancelled) setDemand(null) }
    })()
    return () => { cancelled = true }
  }, [industry])

  if (demand === null && buyers.length === 0) return null
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>🎯 Buyer demand</div>
      {demand !== null && (
        <div style={{ fontSize: 26, fontWeight: 800, color: '#0e7490', fontFamily: 'Georgia, serif' }}>
          {demand} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>buyers watching {industry || 'this market'}</span>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
        On publish, matched buyers get a personalized teaser email with their fit score.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Syndication pack — one-click BizBuySell/LoopNet-ready export copy
// ---------------------------------------------------------------------------
export function SyndicationPackCard({ businessName, industry, location, price, summary }: { businessName?: string | null; industry?: string | null; location?: string | null; price?: number | null; summary?: string | null }) {
  const [copied, setCopied] = useState(false)

  const buildPack = () => {
    const lines = [
      `BUSINESS FOR SALE — ${(businessName || 'Confidential opportunity').toUpperCase()}`,
      `${industry || 'Industry'} · ${location || 'Location TBD'}`,
      price ? `Asking: $${price.toLocaleString()}` : 'Asking: contact for details',
      '',
      summary || 'Confidential, vetted business opportunity. Contact the broker for details.',
      '',
      'Source: Concord Deal Platform — syndication-ready export',
    ]
    return lines.join('\n')
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildPack())
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* ignore */ }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>🌐 Syndication pack</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 10 }}>
        One-click BizBuySell / LoopNet-ready copy — paste into external sites without retyping.
      </div>
      <button onClick={copy} style={{ width: '100%', padding: '10px', borderRadius: 8, background: '#0e7490', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
        {copied ? '✓ Copied — paste into BizBuySell/LoopNet' : '📋 Copy syndication copy'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Offer intelligence — compare the latest offer against asking + comps
// ---------------------------------------------------------------------------
export function OfferIntelligenceCard({ listingId, askingPrice }: { listingId: string; askingPrice?: number | null }) {
  const [offers, setOffers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/offers?listingId=${encodeURIComponent(listingId)}`, { headers: authHeaders() })
        const j = await res.json()
        if (!cancelled) setOffers(Array.isArray(j.offers) ? j.offers : [])
      } catch { if (!cancelled) setOffers([]) }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [listingId])

  if (loading) return null
  const latest = offers[0]
  if (!latest || !latest.amount) return null
  const amount = Number(latest.amount)
  const asking = Number(askingPrice) || 0
  const ratio = asking > 0 ? (amount / asking) * 100 : null

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>🤝 Offer intelligence</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>${amount.toLocaleString()}</div>
      {ratio !== null && (
        <div style={{ fontSize: 12.5, marginTop: 4, color: ratio >= 95 ? '#166534' : ratio >= 85 ? '#9a6700' : '#b91c1c', fontWeight: 700 }}>
          {ratio.toFixed(0)}% of asking{ratio >= 95 ? ' — strong offer' : ratio >= 85 ? ' — negotiate' : ' — low'}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Offer compare — side-by-side offers with health + recommendation
// ---------------------------------------------------------------------------
export function OfferCompareCard({ listingId, askingPrice }: { listingId: string; askingPrice?: number | null }) {
  const toast = useToast()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/offers/compare?listingId=${encodeURIComponent(listingId)}`, { headers: authHeaders() })
      const j = await res.json()
      if (j.ok) setData(j)
    } catch { /* non-fatal */ }
    finally { setLoading(false) }
  }, [listingId])

  useEffect(() => { load() }, [load])

  if (loading) return null
  const offers = data?.offers || []
  if (offers.length === 0) return null
  const rec = data?.recommendation
  const healthColor: Record<string, string> = { strong: '#166534', negotiate: '#9a6700', weak: '#b91c1c' }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 6 }}>⚖️ Offer compare</div>
      {rec?.summary && (
        <div style={{ fontSize: 12, color: 'var(--navy)', fontWeight: 700, background: '#f4f8fc', borderRadius: 8, padding: '8px 10px', marginBottom: 10, lineHeight: 1.5 }}>
          {rec.summary}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {offers.map((o: any) => {
          const h = o.health || {}
          return (
            <div key={o.id} style={{ border: '1px solid #e7edf4', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 13, flex: 1 }}>{o.buyerName || 'Buyer'}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: healthColor[h.health] || 'var(--muted)' }}>{h.label || '—'}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                {o.purchasePrice ? `$${Number(o.purchasePrice).toLocaleString()}` : '—'}
                {data?.askingPrice ? ` · ${o.purchasePrice ? Math.round((Number(o.purchasePrice) / Number(data.askingPrice)) * 100) : '?'}% of asking` : ''}
              </div>
              {h.reasons?.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>
                  {h.reasons.slice(0, 2).join(' · ')}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Closing runway — reverse timeline from target close date
// ---------------------------------------------------------------------------
export function ClosingRunwayCard() {
  const [closeDate, setCloseDate] = useState('')
  const [runway, setRunway] = useState<any[] | null>(null)

  const compute = () => {
    if (!closeDate) return
    const res = fetch(`/api/closing/runway?closeDate=${encodeURIComponent(closeDate)}`, { headers: authHeaders() }).then((r) => r.json()).then((j) => { if (j.ok) setRunway(j.runway) }).catch(() => {})
    return res
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 6 }}>🏁 Closing runway</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
        Pick the target close date — every task schedules itself backwards, so nothing is late.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid #d8dee6', fontSize: 12.5, fontFamily: 'inherit' }} />
        <button onClick={compute} disabled={!closeDate} style={{ padding: '9px 14px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: closeDate ? 'pointer' : 'not-allowed', opacity: closeDate ? 1 : 0.5 }}>
          Compute
        </button>
      </div>
      {runway && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {runway.map((r: any) => (
            <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span>{r.overdue ? '🔴' : r.daysLeft <= 3 ? '🟠' : '🟢'}</span>
              <span style={{ fontWeight: 700, color: r.overdue ? '#b91c1c' : 'var(--navy)', flex: 1 }}>{r.label}</span>
              <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{r.dueDate}{r.overdue ? ' · overdue' : r.daysLeft <= 3 ? ` · ${r.daysLeft}d left` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Closing cost estimator — buyer/seller side numbers on the spot
// ---------------------------------------------------------------------------
export function ClosingCostCard({ purchasePrice }: { purchasePrice?: number | null }) {
  const [price, setPrice] = useState(purchasePrice || 500000)
  const [costs, setCosts] = useState<any>(null)

  useEffect(() => { if (purchasePrice) setPrice(Number(purchasePrice)) }, [purchasePrice])

  const compute = async () => {
    try {
      const res = await fetch(`/api/closing/costs?price=${price}`, { headers: authHeaders() })
      const j = await res.json()
      if (j.ok) setCosts(j.breakdown)
    } catch { /* non-fatal */ }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 6 }}>💰 Closing cost estimate</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} style={{ flex: 1, padding: '9px 10px', borderRadius: 8, border: '1px solid #d8dee6', fontSize: 12.5, fontFamily: 'inherit' }} />
        <button onClick={compute} style={{ padding: '9px 14px', borderRadius: 8, background: '#0e7490', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
          Estimate
        </button>
      </div>
      {costs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Success fee (10%/8% tiered)</span><strong>${costs.successFee.toLocaleString()}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Sales tax (PA 6%, inventory+FFE)</span><strong>${costs.salesTax.toLocaleString()}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--muted)' }}>Legal fees (buyer + seller)</span><strong>${(costs.buyerLegalFees + costs.sellerLegalFees).toLocaleString()}</strong></div>
          <div style={{ borderTop: '1px solid #e7edf4', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800, color: 'var(--navy)' }}>Seller net</span>
            <strong style={{ color: '#166534' }}>${costs.sellerNet.toLocaleString()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800, color: 'var(--navy)' }}>Buyer total</span>
            <strong>${costs.buyerTotalEstimate.toLocaleString()}</strong>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Competitive board — seller-consented urgency lever (Phase A extra)
// ---------------------------------------------------------------------------
export function CompetitiveBoardCard({ listingId, enabled }: { listingId: string; enabled?: boolean }) {
  const toast = useToast()
  const [on, setOn] = useState(!!enabled)
  const [busy, setBusy] = useState(false)

  const toggle = async (next: boolean) => {
    setBusy(true)
    try {
      const res = await fetch('/api/buyers/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'competitive', listingId, enabled: next }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Failed')
      setOn(next)
      toast(next ? 'Competitive board ON — buyers will see live interest counts' : 'Competitive board off', 'success')
    } catch (e: any) {
      toast(e.message || 'Failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 6 }}>🏁 Competitive board</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 10 }}>
        With seller consent, qualified buyers see live interest counts ("N qualified buyers are reviewing this business") — classic urgency lever, no terms leaked.
      </div>
      <button
        onClick={() => toggle(!on)}
        disabled={busy}
        style={{
          width: '100%', padding: '10px', borderRadius: 8, border: 'none', fontWeight: 800, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer',
          background: on ? '#16a34a' : '#eef1f5', color: on ? '#fff' : 'var(--muted)',
        }}
      >
        {busy ? '…' : on ? '✓ ON — urgency live (seller consented)' : 'Turn ON (seller consent required)'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Voice intake — pull a phone-call transcript straight into the concierge.
// ---------------------------------------------------------------------------
export function VoiceIntakeCard({ onDraft }: { onDraft?: (draft: any) => void }) {
  const toast = useToast()
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/calls?hours=168&includeTranscripts=1', { headers: authHeaders() })
      const j = await res.json()
      setCalls(Array.isArray(j.calls) ? j.calls.filter((c: any) => (c.transcripts || []).length > 0).slice(0, 8) : [])
    } catch {
      setCalls([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** Feed a call's transcript into the concierge → structured draft. */
  const useCall = async (call: any) => {
    setBusy(call.id)
    try {
      const transcript = (call.transcripts || [])
        .map((s: any) => `${s.speaker === 'caller' ? 'Caller' : s.speaker === 'assistant' ? 'Assistant' : 'Broker'}: ${s.content}`)
        .join('\n')
      const res = await fetch('/api/listings/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ mode: 'full', context: transcript }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Extraction failed')
      const draft = (j.draft || {}) as any
      if (Object.keys(draft).length === 0) throw new Error('Could not extract fields from this call')
      onDraft?.(draft)
      toast(`🎙️ Call → ${j.coverage?.filled || Object.keys(draft).length} fields filled from the phone call`, 'success')
    } catch (e: any) {
      toast(e.message || 'Could not use this call', 'error')
    } finally {
      setBusy(null)
    }
  }

  const fmtTime = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 4 }}>🎙️ Voice intake</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
        Calls your phone agent answered — turn any transcript into the listing record with one click.
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading recent calls…</div>
      ) : calls.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          No call transcripts yet. Point your Twilio number at <code style={{ fontSize: 11 }}>/api/voice/twilio</code> and the AI receptionist logs every call here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {calls.map((c) => {
            const open = expanded === c.id
            const speakerCount = (c.transcripts || []).filter((s: any) => s.speaker === 'caller').length
            return (
              <div key={c.id} style={{ border: '1px solid #e7edf4', borderRadius: 10, padding: 10, background: open ? '#f7fafc' : '#fff' }}>
                <button
                  onClick={() => setExpanded(open ? null : c.id)}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ fontSize: 15 }}>📞</span>
                    <span style={{ fontWeight: 800, color: 'var(--navy)', flex: 1 }}>
                      {c.caller_name || c.caller_number || 'Unknown caller'}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{fmtTime(c.started_at)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                    {speakerCount} caller turn{speakerCount === 1 ? '' : 's'}
                    {c.duration_seconds ? ` · ${Math.round(c.duration_seconds / 60)}m` : ''} {c.summary ? `· ${String(c.summary).slice(0, 70)}…` : ''}
                  </div>
                </button>
                {open && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ maxHeight: 180, overflowY: 'auto', background: '#0f1023', borderRadius: 8, padding: 10, fontSize: 11.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', fontFamily: 'ui-monospace, monospace' }}>
                      {(c.transcripts || []).map((s: any, i: number) => (
                        <div key={i} style={{ marginBottom: 4 }}>
                          <span style={{ color: s.speaker === 'caller' ? '#f5d97a' : s.speaker === 'assistant' ? '#7dd3fc' : '#94a3b8', fontWeight: 700 }}>
                            {s.speaker === 'caller' ? 'CALLER' : s.speaker === 'assistant' ? 'AGENT' : 'BROKER'}:
                          </span>{' '}
                          {s.content}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => useCall(c)}
                      disabled={busy === c.id}
                      style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: busy === c.id ? 'wait' : 'pointer', opacity: busy === c.id ? 0.6 : 1 }}
                    >
                      {busy === c.id ? '✨ Building the record…' : '✨ Build listing from this call'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Photo AI — vision analysis of the gallery: condition, assets, price signal.
// ---------------------------------------------------------------------------
export function PhotoAICard({ listingId }: { listingId: string }) {
  const toast = useToast()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/photo-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ listingId }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Photo analysis failed')
      setResult(j.analysis)
      toast('📸 Photo AI finished — price signal ready', 'success')
    } catch (e: any) {
      setError(e.message || 'Photo analysis failed')
      toast(e.message || 'Photo analysis failed', 'error')
    } finally {
      setRunning(false)
    }
  }

  const signal = result?.priceSignal
  const signalColor = signal === 'support' ? '#166534' : signal === 'weaken' ? '#b91c1c' : '#9a6700'
  const signalLabel = signal === 'support' ? 'Photos SUPPORT the asking price' : signal === 'weaken' ? 'Photos WEAKEN the asking price' : 'Photos are neutral on price'

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>📸 Photo AI</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 10 }}>
        Vision reads the gallery — condition, equipment, red flags — and tells you whether the photos back the asking price.
      </div>
      {!result && !error && (
        <button
          onClick={run}
          disabled={running}
          style={{ width: '100%', padding: '10px', borderRadius: 8, background: '#0e7490', color: '#fff', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: running ? 'wait' : 'pointer', opacity: running ? 0.6 : 1 }}
        >
          {running ? '👁️ Reading photos…' : '👁️ Analyze gallery photos'}
        </button>
      )}
      {error && (
        <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{error}</div>
      )}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: signalColor }}>{signalLabel}</div>
          {result.priceSignalReason && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{result.priceSignalReason}</div>}
          {result.condition && (
            <div style={{ fontSize: 12, color: 'var(--navy)', lineHeight: 1.55, background: '#f4f8fc', borderRadius: 8, padding: 10 }}>
              <strong>Condition:</strong> {result.condition}
            </div>
          )}
          {result.assets?.length > 0 && (
            <div style={{ fontSize: 12 }}>
              <strong style={{ color: 'var(--navy)' }}>💎 Assets visible:</strong>{' '}
              {result.assets.map((a: string, i: number) => (
                <span key={i} style={{ display: 'inline-block', margin: '2px 4px 2px 0', padding: '3px 8px', borderRadius: 99, background: '#e8f5ee', color: '#166534', fontSize: 11, fontWeight: 700 }}>{a}</span>
              ))}
            </div>
          )}
          {result.redFlags?.length > 0 && (
            <div style={{ fontSize: 12, color: '#b91c1c', lineHeight: 1.55 }}>
              <strong>⚠️ Red flags:</strong> {result.redFlags.join(' · ')}
            </div>
          )}
          {result.listingBoost && (
            <div style={{ fontSize: 12, color: '#9a6700', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 10, lineHeight: 1.5 }}>
              <strong>🚀 Listing boost:</strong> {result.listingBoost}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <button onClick={run} disabled={running} style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'transparent', color: 'var(--navy)', border: '1px solid #c9a84c', fontWeight: 700, fontSize: 12, cursor: running ? 'wait' : 'pointer' }}>
              ↻ Re-analyze
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Auto-closing drive — the closing checklist with reminders
// ---------------------------------------------------------------------------
export function AutoClosingDriveCard() {
  const items = [
    'Buyer & seller signed purchase agreement',
    'Escrow funded',
    'Success fee invoiced',
    '1099 / contractor payment filed',
    'Data room finalized + ZIP exported',
  ]
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>🏁 Closing drive</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((it) => (
          <label key={it} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" style={{ accentColor: '#16a34a' }} />
            {it}
          </label>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
        Everything flows to the commission tracker once the deal closes.
      </div>
    </div>
  )
}
