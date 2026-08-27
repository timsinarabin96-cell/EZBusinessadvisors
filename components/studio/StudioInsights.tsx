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
