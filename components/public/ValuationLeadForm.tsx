/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AutocompleteInput from '@/components/public/AutocompleteInput'

/**
 * Free valuation lead magnet — homepage seller capture. Posts to
 * /api/public/valuation → creates a seller lead in the CRM + emails brokers.
 */
export default function ValuationLeadForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', business_name: '', industry: '', revenue_range: '', location_general: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/public/valuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setDone(true)
      } else {
        setError(data.error || 'Something went wrong — try again.')
      }
    } catch {
      setError('Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Request received</div>
        <div style={{ fontSize: 14, color: '#666', marginTop: 6 }}>A broker will prepare your confidential valuation and reach out shortly.</div>
      </div>
    )
  }

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 14, fontFamily: 'Georgia, serif', outline: 'none', background: '#fff' }

  return (
    <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 24, display: 'grid', gap: 10 }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Get your free valuation</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Confidential · No obligation · Response within 1 business day</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 10 }}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name *" style={inputStyle} required />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email *" type="email" style={inputStyle} required />
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" style={inputStyle} />
      </div>
      <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Business name" style={inputStyle} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 10 }}>
        <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Industry" style={inputStyle} />
        <select value={form.revenue_range} onChange={(e) => setForm({ ...form, revenue_range: e.target.value })} style={inputStyle}>
          <option value="">Annual revenue</option>
          <option value="Under $250k">Under $250k</option>
          <option value="$250k – $500k">$250k – $500k</option>
          <option value="$500k – $1M">$500k – $1M</option>
          <option value="$1M – $5M">$1M – $5M</option>
          <option value="$5M+">$5M+</option>
        </select>
        <AutocompleteInput type="location" value={form.location_general} onChange={(v) => setForm({ ...form, location_general: v })} placeholder="Type a city — e.g. Harrisburg" style={inputStyle} />
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: 12 }}>{error}</div>}
      <button type="submit" disabled={busy} style={{ background: '#c9a84c', color: '#1a1a2e', border: 'none', borderRadius: 6, padding: '13px 20px', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', fontFamily: 'Georgia, serif', fontSize: 15 }}>
        {busy ? 'Sending…' : 'Get My Free Valuation →'}
      </button>
      <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center' }}>We never share your information. No spam, ever.</div>
    </form>
  )
}
