'use client'

import { useState } from 'react'

// =============================================================================
// RequestPricingForm — the agent-gated pricing flow (Idea 1).
// Buyer fills a tiny form → lead goes to the CRM → the live agent texts/calls
// them back to qualify + book. No account needed. Price stays hidden publicly.
// =============================================================================

interface Props {
  listingId?: string
  listingTitle?: string
  compact?: boolean
  buttonLabel?: string
}

export default function RequestPricingForm({ listingId, listingTitle, compact, buttonLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', deal_size: '', timeline: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.phone.trim() && !form.email.trim()) { setError('Add a phone number or email so we can reach you'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/public/pricing-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          deal_size: form.deal_size.trim(),
          timeline: form.timeline.trim(),
          message: form.message.trim() || undefined,
          listing_id: listingId,
          listing_title: listingTitle,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!j.ok) { setError(j.error || 'Something went wrong — please try again.'); return }
      setDone(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '18px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
        <div style={{ fontWeight: 800, color: '#166534', fontSize: 14 }}>Request received!</div>
        <div style={{ fontSize: 12.5, color: '#4d7c0f', marginTop: 6, lineHeight: 1.5 }}>
          {form.phone ? 'Our agent will text you shortly with pricing.' : 'An agent will reach out shortly with pricing.'}
        </div>
      </div>
    )
  }

  const label = buttonLabel || 'Request Pricing'
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: '#c9a84c', color: '#1a1a2e', border: 'none', borderRadius: 7,
          padding: compact ? '9px 12px' : '13px 16px', fontWeight: 800, cursor: 'pointer',
          fontFamily: 'Georgia, serif', fontSize: compact ? 12.5 : 14,
        }}
      >
        {open ? '− Cancel' : label}
      </button>

      {open && (
        <form onSubmit={submit} style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10, lineHeight: 1.5 }}>
            Fill this out and our agent will get back to you with pricing — no account needed.
          </div>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name *" style={inputStyle} />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (best for a fast reply)" style={inputStyle} />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" style={inputStyle} />
          <select value={form.deal_size} onChange={(e) => setForm({ ...form, deal_size: e.target.value })} style={inputStyle}>
            <option value="">Approx. deal size…</option>
            <option>Under $250k</option>
            <option>$250k – $500k</option>
            <option>$500k – $1M</option>
            <option>$1M – $2.5M</option>
            <option>$2.5M – $5M</option>
            <option>Over $5M</option>
          </select>
          <select value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })} style={inputStyle}>
            <option value="">Timeline…</option>
            <option>As soon as possible</option>
            <option>3–6 months</option>
            <option>6–12 months</option>
            <option>Just exploring</option>
          </select>
          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Anything we should know? (optional)" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          {error && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={busy} style={{ width: '100%', background: '#0e7490', color: '#fff', border: 'none', borderRadius: 7, padding: '11px 14px', fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Georgia, serif' }}>
            {busy ? 'Sending…' : 'Request Pricing →'}
          </button>
        </form>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', marginBottom: 8,
  border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 13.5, outline: 'none',
  fontFamily: 'inherit', background: '#fff',
}
