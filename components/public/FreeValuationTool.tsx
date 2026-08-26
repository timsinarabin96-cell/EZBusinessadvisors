/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// FreeValuationTool — the /valuation lead magnet (Flippa-style).
// Step 1: instant industry-multiple range, client-side, no account.
// Step 2: email capture → POST /api/public/valuation → seller lead in CRM.
// Uses the real market-multiples engine (40+ industry bands) so the instant
// number is the same data the brokers use.
// =============================================================================

import { useMemo, useState } from 'react'
import { MARKET_MULTIPLES, bandForIndustry, matchIndustry } from '@/lib/marketMultiplesCore'
import { formatWithCommas } from '@/components/ui/MoneyInput'

const INDUSTRIES = Array.from(new Set(MARKET_MULTIPLES.map((b) => b.industry))).sort()

const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function FreeValuationTool() {
  const [industry, setIndustry] = useState('')
  const [sde, setSde] = useState('')
  const [range, setRange] = useState<{ lo: number; hi: number; basis: string; note?: string } | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', business_name: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const band = useMemo(() => {
    if (!industry) return null
    const matched = matchIndustry(industry)
    return bandForIndustry(matched || industry, 'SDE')
  }, [industry])

  const estimate = () => {
    const sdeNum = Number(String(sde).replace(/[$,]/g, ''))
    if (!band || !sdeNum || sdeNum <= 0) return
    const lo = sdeNum * band.min
    const hi = sdeNum * band.max
    setRange({ lo, hi, basis: band.basis, note: band.sourceNote })
  }

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !EMAIL_RE.test(form.email.trim())) {
      setError('Name and a valid email are required to unlock your report.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/public/valuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          business_name: form.business_name.trim() || undefined,
          industry: industry || undefined,
          revenue_range: sde || undefined,
          location_general: undefined,
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Could not submit')
      setDone(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputDark: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 14.5, fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: '14px 0 5px', textTransform: 'uppercase', letterSpacing: '.04em' }

  return (
    <div style={{ background: 'linear-gradient(135deg,#102a43,#0f3460)', color: '#fff', borderRadius: 18, padding: 34, boxShadow: '0 18px 50px rgba(16,42,67,0.25)' }}>
      {done ? (
        <div style={{ textAlign: 'center', padding: '30px 10px' }}>
          <div style={{ fontSize: 52, marginBottom: 14 }}>🎉</div>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Georgia, serif' }}>Your valuation request is in!</div>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14.5, lineHeight: 1.6, maxWidth: 460, margin: '12px auto 0' }}>
            A Concord broker will review your details and reach out within one business day with a detailed opinion of value. Keep an eye on your inbox.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: range ? '1fr 1fr' : '1fr', gap: 28, alignItems: 'start' }}>
          {/* Estimator */}
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'Georgia, serif' }}>⚡ Instant estimate</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>Industry × your annual profit (SDE) → market range in seconds.</div>
            <label style={label}>Industry</label>
            <select value={industry} onChange={(e) => { setIndustry(e.target.value); setRange(null) }} style={inputDark}>
              <option value="" style={{ color: '#333' }}>Select your industry…</option>
              {INDUSTRIES.map((ind) => <option key={ind} value={ind} style={{ color: '#333' }}>{ind}</option>)}
            </select>
            <label style={label}>Annual owner benefit (SDE)</label>
            <input value={sde} onChange={(e) => setSde(formatWithCommas(e.target.value))} inputMode="decimal" placeholder="e.g. 150,000" style={inputDark} />
            <button onClick={estimate} disabled={!band || !Number(String(sde).replace(/[$,]/g, ''))} style={{ width: '100%', marginTop: 18, padding: '13px', borderRadius: 9, background: '#c9a84c', color: '#102a43', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
              Estimate my value →
            </button>
            {band && (
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginTop: 10 }}>
                Multiple basis: {band.basis} {band.min}–{band.max}× {band.sourceNote ? `· ${band.sourceNote}` : ''}
              </div>
            )}
          </div>

          {/* Result + unlock */}
          {range && (
            <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Estimated market range</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#c9a84c', marginTop: 6, fontFamily: 'Georgia, serif' }}>
                {fmt$(range.lo)} – {fmt$(range.hi)}
              </div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', marginTop: 8, lineHeight: 1.5 }}>
                Based on {industry} {range.basis} multiples. Unlock the full report with your email — free, confidential, no obligation.
              </div>

              <form onSubmit={unlock} style={{ marginTop: 16 }}>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" style={inputDark} />
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="Email — where we send your report" style={{ ...inputDark, marginTop: 9 }} />
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" style={{ ...inputDark, marginTop: 9 }} />
                <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Business name (optional)" style={{ ...inputDark, marginTop: 9 }} />
                {error && <div style={{ color: '#fca5a5', fontSize: 12.5, marginTop: 9 }}>{error}</div>}
                <button type="submit" disabled={submitting} style={{ width: '100%', marginTop: 14, padding: '13px', borderRadius: 9, background: '#c9a84c', color: '#102a43', border: 'none', fontWeight: 800, fontSize: 15, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'Georgia, serif' }}>
                  {submitting ? 'Sending…' : '🔓 Unlock my full report'}
                </button>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 10 }}>
                  Confidential. No spam — only your valuation and a broker follow-up.
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
