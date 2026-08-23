'use client'

import { useMemo, useState } from 'react'
import { qualifyBuyer, LEVEL_LABELS, type UnderwritingResult } from '@/lib/underwritingCore.mts'
import { CREDIT_OPTIONS, LEVEL_COLORS, saveUnderwritingLead } from '@/lib/underwriting'

/**
 * "Am I qualified?" — instant buyer pre-qualification.
 * Answer 5 questions → qualification level + badges + next steps, instantly,
 * zero tokens. Qualified buyers can leave their email so a broker follows up.
 */
export default function QualifyPage() {
  const [targetPrice, setTargetPrice] = useState(500000)
  const [liquidCapital, setLiquidCapital] = useState(100000)
  const [annualIncome, setAnnualIncome] = useState(150000)
  const [creditTier, setCreditTier] = useState('good')
  const [sbaPreApproved, setSbaPreApproved] = useState(false)
  const [hasBusinessExperience, setHasBusinessExperience] = useState(false)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const result: UnderwritingResult = useMemo(
    () => qualifyBuyer({ targetPrice, liquidCapital, annualIncome, creditTier: creditTier as any, sbaPreApproved, hasBusinessExperience }),
    [targetPrice, liquidCapital, annualIncome, creditTier, sbaPreApproved, hasBusinessExperience],
  )

  const color = LEVEL_COLORS[result.level]

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    const res = await saveUnderwritingLead({
      email: email.trim(),
      name: name.trim() || undefined,
      target_price: targetPrice,
      liquid_capital: liquidCapital,
      annual_income: annualIncome,
      credit_tier: creditTier,
      sba_pre_approved: sbaPreApproved,
      has_business_experience: hasBusinessExperience,
      result,
    })
    setSubmitting(false)
    if (res.ok) setSent(true)
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '56px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Buyer Pre-Qualification</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 36, color: '#1a1a2e', margin: '10px 0 12px' }}>
          Are you qualified to buy?
        </h1>
        <p style={{ color: '#666', fontSize: 15, maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
          Answer five quick questions and see your qualification level instantly — Funded, Pre-approved, Qualified, or Exploring. No credit check, no account needed.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 28, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 16, padding: 28, boxShadow: '0 10px 35px rgba(16,42,67,0.07)' }}>
          <Field label="Target purchase price">
            <Slider value={targetPrice} min={100000} max={3000000} step={50000} onChange={setTargetPrice} fmt={(v) => '$' + v.toLocaleString()} />
          </Field>
          <Field label="Liquid capital available (cash + investments)">
            <Slider value={liquidCapital} min={25000} max={1000000} step={25000} onChange={setLiquidCapital} fmt={(v) => '$' + v.toLocaleString()} />
          </Field>
          <Field label="Annual household income">
            <Slider value={annualIncome} min={40000} max={1000000} step={10000} onChange={setAnnualIncome} fmt={(v) => '$' + v.toLocaleString()} />
          </Field>
          <Field label="Credit score">
            <select value={creditTier} onChange={(e) => setCreditTier(e.target.value)} style={inputStyle}>
              {CREDIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', margin: '14px 0 4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#1a1a2e', cursor: 'pointer' }}>
              <input type="checkbox" checked={sbaPreApproved} onChange={(e) => setSbaPreApproved(e.target.checked)} />
              SBA loan pre-approval on file
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#1a1a2e', cursor: 'pointer' }}>
              <input type="checkbox" checked={hasBusinessExperience} onChange={(e) => setHasBusinessExperience(e.target.checked)} />
              Prior business ownership
            </label>
          </div>
        </div>

        <div style={{ background: '#fff', border: `1px solid ${color}55`, borderRadius: 16, padding: 28, boxShadow: '0 10px 35px rgba(16,42,67,0.07)' }}>
          <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Your Qualification</div>
          <div style={{ fontSize: 34, fontWeight: 800, color, fontFamily: 'Georgia, serif', marginTop: 8 }}>{result.levelLabel}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1, height: 8, background: '#eef2f5', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${result.score}%`, background: color, borderRadius: 99, transition: 'width .4s ease' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>{result.score}/100</span>
          </div>

          {result.badges.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {result.badges.map((b) => <span key={b} style={{ padding: '5px 10px', background: `${color}12`, color, borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{b}</span>)}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            {result.reasons.map((r) => <p key={r} style={{ fontSize: 13.5, color: '#555', margin: '6px 0', lineHeight: 1.55 }}>• {r}</p>)}
          </div>
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#f5f8fb' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#102a43', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Next steps</div>
            {result.actions.map((a) => <p key={a} style={{ fontSize: 13, color: '#1a1a2e', margin: '5px 0', lineHeight: 1.5 }}>→ {a}</p>)}
          </div>

          {!sent ? (
            <form onSubmit={submit} style={{ marginTop: 16 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" style={{ ...inputStyle, marginBottom: 8 }} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email — get matched with deals you qualify for" style={{ ...inputStyle, marginBottom: 10 }} required />
              <button type="submit" disabled={submitting} style={{ width: '100%', background: 'linear-gradient(135deg, #c9a84c, #a8873a)', color: '#1a1a2e', fontFamily: 'Georgia, serif', fontWeight: 800, fontSize: 14, border: 'none', padding: '12px 20px', borderRadius: 8, cursor: 'pointer' }}>
                {submitting ? 'Saving…' : 'Get Matched with Deals'}
              </button>
              <p style={{ fontSize: 11.5, color: '#9aa5b1', marginTop: 8, lineHeight: 1.5 }}>
                A broker reviews your profile and reaches out with businesses you can realistically buy. No spam, unsubscribe anytime.
              </p>
            </form>
          ) : (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: '#e6f6ec', color: '#1e7e34', fontWeight: 700, fontSize: 14 }}>
              ✅ Got it — a broker will reach out with deals you qualify for.
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#9aa5b1', textAlign: 'center', marginTop: 24, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
        Advisory estimate based on common SBA 7(a) underwriting heuristics (down payment, debt-service coverage, credit minimums). Not a credit decision — a lender makes the final call.
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 18 }}><label style={{ display: 'block', fontFamily: 'Georgia, serif', fontWeight: 600, color: '#1a1a2e', fontSize: 13.5, marginBottom: 8 }}>{label}</label>{children}</div>
}

function Slider({ value, min, max, step, onChange, fmt }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#c9a84c', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#1a1a2e', fontWeight: 700, marginTop: 4 }}>
        <span>{fmt(value)}</span>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #dce6ef', background: '#fff', color: '#1a1a2e', fontSize: 14,
  fontFamily: 'Georgia, serif', outline: 'none',
}
