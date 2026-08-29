/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useMemo, useState } from 'react'

// SBA 7(a) payment calculator + quick eligibility quiz.
// Pure client-side math — no API needed. Shows realistic monthly payments
// for a 10% down acquisition loan (10-year term, current SBA rate band).

const RATE_LOW = 0.085
const RATE_HIGH = 0.105

const QUIZ = [
  { q: 'Is your credit score roughly 680 or above?', hint: 'SBA lenders typically look for 680+.' },
  { q: 'Can you put down ~10% of the purchase price?', hint: 'Plus a few months of working capital.' },
  { q: 'Do you have 2+ years of relevant industry experience?', hint: 'Or a strong, documented transition plan.' },
  { q: 'Is your debt-to-income ratio manageable?', hint: 'Total monthly debt payments under ~43% of income.' },
  { q: 'Are you ready to run the business full-time?', hint: 'SBA loans require the buyer to be an owner-operator.' },
]

export default function SbaCalculator({ askingPrice }: { askingPrice?: number | null }) {
  const [price, setPrice] = useState(askingPrice && askingPrice > 0 ? askingPrice : 500000)
  const [answers, setAnswers] = useState<Record<number, boolean>>({})

  const loanAmount = Math.max(0, price * 0.9)
  const monthly = useMemo(() => {
    // 10-year amortization (120 months), SBA 7(a) standard.
    const n = 120
    const low = (RATE_LOW / 12) * Math.pow(1 + RATE_LOW / 12, n) / (Math.pow(1 + RATE_LOW / 12, n) - 1) * loanAmount
    const high = (RATE_HIGH / 12) * Math.pow(1 + RATE_HIGH / 12, n) / (Math.pow(1 + RATE_HIGH / 12, n) - 1) * loanAmount
    return { low: Math.round(low), high: Math.round(high) }
  }, [loanAmount])

  const answeredCount = Object.keys(answers).length
  const readyCount = QUIZ.filter((_, i) => answers[i]).length
  const allAnswered = answeredCount === QUIZ.length
  const ready = allAnswered && readyCount >= 4

  const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 18, marginBottom: 32 }}>
      {/* Payment calculator */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 13, color: '#0e7490', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>SBA 7(a) Payment Calculator</div>
        <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '8px 0 18px' }}>What would the monthly payment be?</h3>
        <label style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>Purchase price</label>
        <input
          type="range"
          min={50000}
          max={3000000}
          step={25000}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          style={{ width: '100%', margin: '10px 0 6px' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#1a1a2e', fontWeight: 800, marginBottom: 18 }}>
          <span>{fmt$(price)}</span>
          <span style={{ color: '#0e7490' }}>{fmt$(price * 0.1)} down (10%)</span>
        </div>
        <div style={{ background: '#f8f6ef', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Estimated monthly payment</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>
            {fmt$(monthly.low)}–{fmt$(monthly.high)}
          </div>
          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            Loan of {fmt$(loanAmount)} · 10 years · 8.5–10.5% APR (current SBA band)
          </div>
        </div>
      </div>

      {/* Eligibility quiz */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 13, color: '#0e7490', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Quick Eligibility Quiz</div>
        <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '8px 0 14px' }}>Are you SBA-ready?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {QUIZ.map((item, i) => {
            const val = answers[i]
            return (
              <button
                key={item.q}
                onClick={() => setAnswers((a) => ({ ...a, [i]: !a[i] }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                  background: val ? '#ecfdf5' : '#fff', border: `1px solid ${val ? '#22c55e' : '#ece8dc'}`,
                }}
              >
                <span style={{ fontSize: 16 }}>{val ? '✅' : '⬜'}</span>
                <span style={{ fontSize: 13.5, color: '#1a1a2e' }}>
                  {item.q}
                  <span style={{ display: 'block', fontSize: 11.5, color: '#999', marginTop: 2 }}>{item.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8, background: '#f8f6ef', fontSize: 13.5 }}>
          {!allAnswered ? (
            <span style={{ color: '#666' }}>Answer all 5 to get your readiness verdict.</span>
          ) : ready ? (
            <span style={{ color: '#15803d', fontWeight: 700 }}>🎯 Likely SBA-ready — {readyCount}/5. Talk to a lender to confirm.</span>
          ) : (
            <span style={{ color: '#b45309', fontWeight: 700 }}>⚠️ Borderline ({readyCount}/5). A lender can tell you what to fix.</span>
          )}
        </div>
      </div>
    </div>
  )
}
