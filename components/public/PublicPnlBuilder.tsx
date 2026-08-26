/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// PublicPnlBuilder — public P&L recast lead magnet (Flippa P&L Builder play).
// Seller enters high-level numbers; we compute an instant broker-style SDE
// recast (net profit + owner salary + discretionary add-backs − one-time
// gains), then capture the lead via /api/public/valuation.
// =============================================================================

import { useState } from 'react'
import { formatWithCommas } from '@/components/ui/MoneyInput'

const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const num = (v: string) => Number(String(v).replace(/[$,]/g, '')) || 0

export default function PublicPnlBuilder() {
  const [form, setForm] = useState({
    revenue: '',
    expenses: '',
    ownerSalary: '',
    ownerPerks: '',
    oneTime: '',
    name: '',
    email: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const revenue = num(form.revenue)
  const expenses = num(form.expenses)
  const ownerSalary = num(form.ownerSalary)
  const ownerPerks = num(form.ownerPerks)
  const oneTime = num(form.oneTime)

  // Broker-standard SDE recast:
  // net profit = revenue − operating expenses
  // SDE = net profit + owner salary + owner perks − one-time gains
  const netProfit = revenue - expenses
  const sde = netProfit + ownerSalary + ownerPerks - oneTime
  const showResult = revenue > 0 || sde !== 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !EMAIL_RE.test(form.email.trim())) {
      setError('Name and a valid email are required to save your recast.')
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
          business_name: undefined,
          industry: undefined,
          revenue_range: String(revenue || 0),
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

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 14.5, fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: '14px 0 5px', textTransform: 'uppercase', letterSpacing: '.04em' }

  if (done) {
    return (
      <div style={{ background: 'linear-gradient(135deg,#102a43,#0f3460)', color: '#fff', borderRadius: 18, padding: 40, textAlign: 'center', boxShadow: '0 18px 50px rgba(16,42,67,0.25)' }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>📊</div>
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Georgia, serif' }}>Your recast is saved!</div>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14.5, lineHeight: 1.6, maxWidth: 460, margin: '12px auto 0' }}>
          A Concord broker will reach out with a broker-grade opinion of value based on your numbers. Want the full range right now?
        </p>
        <a href="/valuation" style={{ display: 'inline-block', marginTop: 18, background: '#c9a84c', color: '#102a43', padding: '13px 30px', borderRadius: 9, textDecoration: 'none', fontWeight: 800, fontSize: 14.5 }}>
          Get my free valuation →
        </a>
      </div>
    )
  }

  return (
    <div style={{ background: 'linear-gradient(135deg,#102a43,#0f3460)', color: '#fff', borderRadius: 18, padding: 34, boxShadow: '0 18px 50px rgba(16,42,67,0.25)' }}>
      <div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'Georgia, serif' }}>🧾 Instant P&L recast</div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
        Enter your rough numbers — we&apos;ll show the earnings figure buyers actually pay for.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' }}>
        <div>
          <label style={label}>Annual revenue</label>
          <input value={form.revenue} onChange={(e) => setForm({ ...form, revenue: formatWithCommas(e.target.value) })} inputMode="decimal" placeholder="e.g. 500,000" style={inputStyle} />
        </div>
        <div>
          <label style={label}>Operating expenses (COGS + overhead)</label>
          <input value={form.expenses} onChange={(e) => setForm({ ...form, expenses: formatWithCommas(e.target.value) })} inputMode="decimal" placeholder="e.g. 350,000" style={inputStyle} />
        </div>
        <div>
          <label style={label}>Your salary as owner</label>
          <input value={form.ownerSalary} onChange={(e) => setForm({ ...form, ownerSalary: formatWithCommas(e.target.value) })} inputMode="decimal" placeholder="e.g. 80,000" style={inputStyle} />
        </div>
        <div>
          <label style={label}>Owner perks (car, meals, family on payroll…)</label>
          <input value={form.ownerPerks} onChange={(e) => setForm({ ...form, ownerPerks: formatWithCommas(e.target.value) })} inputMode="decimal" placeholder="e.g. 25,000" style={inputStyle} />
        </div>
        <div>
          <label style={label}>One-time expenses (subtract)</label>
          <input value={form.oneTime} onChange={(e) => setForm({ ...form, oneTime: formatWithCommas(e.target.value) })} inputMode="decimal" placeholder="e.g. 10,000" style={inputStyle} />
        </div>
      </div>

      {showResult && (
        <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Net profit</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>{fmt$(netProfit)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Seller&apos;s Discretionary Earnings (SDE)</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#c9a84c', marginTop: 3, fontFamily: 'Georgia, serif' }}>{fmt$(sde)}</div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginTop: 10, lineHeight: 1.5 }}>
            {sde > 0
              ? 'This is the number buyers and lenders use. Save it below and we\u2019ll value your business against real market multiples — free.'
              : 'Looks like expenses exceed revenue — adjust the numbers or talk to a broker about improving margins before sale.'}
          </div>
        </div>
      )}

      <form onSubmit={submit} style={{ marginTop: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
          <div>
            <label style={label}>Full name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" style={inputStyle} />
          </div>
          <div>
            <label style={label}>Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="Where we send your report" style={inputStyle} />
          </div>
        </div>
        {error && <div style={{ color: '#fca5a5', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
        <button type="submit" disabled={submitting} style={{ width: '100%', marginTop: 16, padding: '13px', borderRadius: 9, background: '#c9a84c', color: '#102a43', border: 'none', fontWeight: 800, fontSize: 15, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'Georgia, serif' }}>
          {submitting ? 'Saving…' : '💾 Save my recast & get a free valuation'}
        </button>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 10 }}>
          Confidential. No spam — only your report and a broker follow-up.
        </div>
      </form>
    </div>
  )
}
