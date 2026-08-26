/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// DealAlertsSignup — public deal-alert signup + self-service manage.
// Signup posts to /api/public/notify (accountless email capture → CRM).
// "Manage my alerts" looks up subscriptions by email and lets the visitor
// unsubscribe — all email-scoped, no account required.
// =============================================================================

import { useState } from 'react'

const SIZES = [
  { label: 'Any price', value: '' },
  { label: 'Under $250k', value: '250000' },
  { label: '$250k – $500k', value: '500000' },
  { label: '$500k – $1M', value: '1000000' },
  { label: '$1M+', value: '' },
]

interface ManagedSub {
  id: string
  name: string | null
  criteria: { industries?: string[]; max_price?: number | null; min_sde?: number | null }
  active: boolean
  created_at: string
}

export default function DealAlertsSignup({ industries }: { industries: string[] }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [size, setSize] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // manage mode
  const [manageEmail, setManageEmail] = useState('')
  const [subs, setSubs] = useState<ManagedSub[] | null>(null)
  const [manageBusy, setManageBusy] = useState(false)
  const [manageMsg, setManageMsg] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Email is required'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/public/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          criteria: {
            industries: industry ? [industry] : [],
            max_price: size ? Number(size) : null,
          },
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok) setDone(true)
      else setError(data.error || 'Something went wrong — try again.')
    } catch {
      setError('Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  const loadManage = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!manageEmail.trim()) { setManageMsg('Enter your email first'); return }
    setManageBusy(true); setManageMsg('')
    try {
      const res = await fetch(`/api/public/notify/manage?email=${encodeURIComponent(manageEmail.trim())}`)
      const data = await res.json()
      if (res.ok && data.ok) setSubs(data.subscriptions || [])
      else setManageMsg(data.error || 'Could not load alerts')
    } catch {
      setManageMsg('Could not load alerts')
    } finally {
      setManageBusy(false)
    }
  }

  const unsubscribe = async (id: string) => {
    setManageBusy(true)
    try {
      const res = await fetch('/api/public/notify/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, email: manageEmail.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setSubs((s) => (s || []).filter((x) => x.id !== id))
        setManageMsg('Alert removed ✓')
      } else {
        setManageMsg(data.error || 'Could not remove alert')
      }
    } catch {
      setManageMsg('Could not remove alert')
    } finally {
      setManageBusy(false)
    }
  }

  const criteriaLabel = (s: ManagedSub) => {
    const parts: string[] = []
    const inds = s.criteria?.industries || []
    if (inds.length) parts.push(inds.join(', '))
    if (s.criteria?.max_price) parts.push(`≤ $${Number(s.criteria.max_price).toLocaleString()}`)
    if (s.criteria?.min_sde) parts.push(`SDE ≥ $${Number(s.criteria.min_sde).toLocaleString()}`)
    return parts.length ? parts.join(' · ') : 'Any business'
  }

  return (
    <div style={{ display: 'grid', gap: 28 }}>
      {/* ── Signup ── */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 16, padding: 28, boxShadow: '0 12px 40px rgba(16,42,67,0.06)' }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>🔔 Deal Alerts</div>
        <div style={{ fontSize: 13.5, color: '#666', marginBottom: 18, lineHeight: 1.6 }}>
          Tell us what you're looking for — when a matching business goes live, you're the first to know. No account needed.
        </div>

        {done ? (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16, fontSize: 14, color: '#166534', fontWeight: 600 }}>
            ✅ You're all set! We'll email <strong>{email}</strong> when a matching business goes live. Want more control? Use "Manage my alerts" below.
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" style={inputStyle} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email *" type="email" required style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={inputStyle}>
                <option value="">Any industry</option>
                {industries.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
              <select value={size} onChange={(e) => setSize(e.target.value)} style={inputStyle}>
                {SIZES.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {error && <div style={{ color: '#b91c1c', fontSize: 12.5 }}>{error}</div>}
            <button type="submit" disabled={busy} style={{ background: '#1a1a2e', color: '#c9a84c', border: 'none', borderRadius: 8, padding: '13px', fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 15, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Subscribing…' : 'Notify me when matches go live →'}
            </button>
            <div style={{ fontSize: 12, color: '#999' }}>🔒 We never share your email. Unsubscribe anytime.</div>
          </form>
        )}
      </div>

      {/* ── Manage ── */}
      <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>Manage my alerts</div>
        <div style={{ fontSize: 12.5, color: '#888', marginBottom: 12 }}>See what you're subscribed to and unsubscribe — enter the email you used.</div>
        <form onSubmit={loadManage} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={manageEmail} onChange={(e) => setManageEmail(e.target.value)} placeholder="Email used for alerts" type="email" style={{ ...inputStyle, flex: '1 1 220px' }} />
          <button type="submit" disabled={manageBusy} style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, padding: '11px 18px', fontWeight: 700, cursor: manageBusy ? 'wait' : 'pointer', fontSize: 13.5 }}>
            {manageBusy ? '…' : 'View my alerts'}
          </button>
        </form>
        {manageMsg && <div style={{ fontSize: 13, color: '#555', marginTop: 10 }}>{manageMsg}</div>}
        {subs && (
          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            {subs.length === 0 && <div style={{ fontSize: 13.5, color: '#888' }}>No active alerts for this email.</div>}
            {subs.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', border: '1px solid #e5e0d3', borderRadius: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1a2e' }}>{criteriaLabel(s)}</div>
                  <div style={{ fontSize: 11.5, color: '#999' }}>
                    {s.name ? `${s.name} · ` : ''}signed up {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {!s.active && ' · paused'}
                  </div>
                </div>
                <button onClick={() => unsubscribe(s.id)} disabled={manageBusy} style={{ background: '#fee', color: '#b91c1c', border: '1px solid #f0c4c4', borderRadius: 6, padding: '8px 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  Unsubscribe
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '12px 14px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 14, fontFamily: 'Georgia, serif', outline: 'none', background: '#fff',
}
