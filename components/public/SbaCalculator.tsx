'use client'

import { useState } from 'react'
import { fmt$ } from '@/lib/recast'

// SBA 7(a) affordability estimate — deterministic, zero tokens.
// Assumptions: 10% down, 10-yr term, ~8.5% blended rate (SBA prime + margin).
const DOWN_PCT = 0.10
const TERM_YEARS = 10
const RATE = 0.085

export default function SbaCalculator({ askingPrice }: { askingPrice: number | null }) {
  const [downPct, setDownPct] = useState(15)
  const [rate, setRate] = useState(8.5)
  const [termYears, setTermYears] = useState(10)

  if (askingPrice == null || askingPrice <= 0) {
    return (
      <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: 16, fontSize: 13, color: '#777' }}>
        SBA financing estimate available once the asking price is shared.
      </div>
    )
  }

  const downPctActual = downPct / 100
  const loanAmount = askingPrice * (1 - downPctActual)
  const monthlyRate = rate / 100 / 12
  const months = termYears * 12
  const monthlyPayment =
    monthlyRate === 0 ? loanAmount / months : (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
  const totalInterest = monthlyPayment * months - loanAmount
  const downPayment = askingPrice * downPctActual

  return (
    <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>🏦 SBA 7(a) affordability estimate</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Illustrative only — actual terms depend on lender approval.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Down payment</div>
          <select value={downPct} onChange={(e) => setDownPct(Number(e.target.value))} style={{ width: '100%', padding: '7px 9px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 13, background: '#fff' }}>
            <option value={10}>10%</option>
            <option value={15}>15%</option>
            <option value={20}>20%</option>
            <option value={25}>25%</option>
            <option value={30}>30%</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Rate</div>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} style={{ width: '100%', padding: '7px 9px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 13, background: '#fff' }}>
            <option value={7.5}>7.5%</option>
            <option value={8.5}>8.5%</option>
            <option value={9.5}>9.5%</option>
            <option value={10.5}>10.5%</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Term</div>
          <select value={termYears} onChange={(e) => setTermYears(Number(e.target.value))} style={{ width: '100%', padding: '7px 9px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 13, background: '#fff' }}>
            <option value={7}>7 yrs</option>
            <option value={10}>10 yrs</option>
            <option value={15}>15 yrs</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Down payment</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e' }}>{fmt$(downPayment)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Est. monthly payment</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#c9a84c' }}>{fmt$(Math.round(monthlyPayment))}/mo</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total interest</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{fmt$(Math.round(totalInterest))}</div>
        </div>
      </div>
    </div>
  )
}
