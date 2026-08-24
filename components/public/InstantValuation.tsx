'use client'

// =============================================================================
// InstantValuation — "what's my business worth?" estimator.
// Client-side, instant, no account: industry + SDE → immediate range using
// standard market multiples. Feeds the free valuation lead form (lead magnet).
// =============================================================================

import { useState } from 'react'

const MULTIPLES: Record<string, { lo: number; hi: number }> = {
  'Food & Beverage': { lo: 1.8, hi: 3.2 },
  Restaurant: { lo: 1.8, hi: 3.0 },
  Retail: { lo: 1.5, hi: 2.8 },
  'Health & Fitness': { lo: 2.0, hi: 3.5 },
  Automotive: { lo: 1.8, hi: 3.2 },
  Construction: { lo: 1.7, hi: 3.0 },
  'Business Services': { lo: 2.2, hi: 4.0 },
  'Professional Services': { lo: 2.5, hi: 4.5 },
  'Home Services': { lo: 1.9, hi: 3.3 },
  Tech: { lo: 3.0, hi: 6.0 },
  'E-commerce': { lo: 2.2, hi: 4.5 },
  Manufacturing: { lo: 2.0, hi: 3.8 },
  Education: { lo: 2.0, hi: 3.5 },
  Hospitality: { lo: 2.0, hi: 3.4 },
  Logistics: { lo: 2.0, hi: 3.6 },
  Other: { lo: 1.8, hi: 3.2 },
}

const INDUSTRIES = Object.keys(MULTIPLES)

const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

export default function InstantValuation({ onLead }: { onLead?: (data: { industry: string; sde: number; rangeLow: number; rangeHigh: number }) => void }) {
  const [industry, setIndustry] = useState('')
  const [sde, setSde] = useState('')
  const [result, setResult] = useState<{ lo: number; hi: number } | null>(null)

  const estimate = () => {
    const sdeNum = Number(sde)
    if (!industry || !sdeNum || sdeNum <= 0) return
    const m = MULTIPLES[industry] || MULTIPLES.Other
    const lo = sdeNum * m.lo
    const hi = sdeNum * m.hi
    setResult({ lo, hi })
    onLead?.({ industry, sde: sdeNum, rangeLow: lo, rangeHigh: hi })
  }

  return (
    <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', color: '#fff', borderRadius: 16, padding: 26 }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>⚡ Instant Valuation</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 18 }}>
        See what your business is worth in seconds — no account needed. Industry × SDE multiple estimate.
      </div>

      <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          style={{ padding: '11px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}
        >
          <option value="" style={{ color: '#333' }}>Select your industry…</option>
          {INDUSTRIES.map((ind) => <option key={ind} value={ind} style={{ color: '#333' }}>{ind}</option>)}
        </select>
        <input
          value={sde}
          onChange={(e) => setSde(e.target.value)}
          type="number"
          placeholder="Your annual profit (SDE) — e.g. 150000"
          style={{ padding: '11px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 14, fontFamily: 'inherit' }}
        />
      </div>

      <button
        onClick={estimate}
        style={{ width: '100%', padding: '13px', borderRadius: 8, background: '#c9a84c', color: '#1a1a2e', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'Georgia, serif' }}
      >
        Estimate my value →
      </button>

      {result && (
        <div style={{ marginTop: 18, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estimated market range</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#c9a84c', marginTop: 4 }}>
            {fmt$(result.lo)} – {fmt$(result.hi)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>
            Based on {industry} SDE multiples. Get a broker-grade valuation below for an exact number.
          </div>
        </div>
      )}
    </div>
  )
}
