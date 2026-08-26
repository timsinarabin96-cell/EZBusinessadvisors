/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'

/**
 * "Get alerts for this search" — accountless email capture that feeds the
 * CRM's deal_notify_subscriptions. When a matching listing goes live, the
 * subscriber gets an email (lib/notifySubscriptions.matchPublicSubscriptions).
 */
export default function SavedSearchAlert({ industry, location, maxPrice }: { industry?: string; location?: string; maxPrice?: string }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/public/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          criteria: {
            industries: industry ? [industry] : [],
            locations: location ? [location] : [],
            max_price: maxPrice ? Number(maxPrice) : null,
          },
        }),
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
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14, fontSize: 13, color: '#166534', fontWeight: 600 }}>
        ✓ You're on the list — we'll email you when a matching business goes live.
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 12, padding: 18, marginBottom: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>🔔 Get alerts for this search</div>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
        New matching listings land in your inbox first. No account needed.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          style={{ padding: '10px 12px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 13, fontFamily: 'Georgia, serif', outline: 'none', flex: '1 1 140px' }}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email *"
          type="email"
          required
          style={{ padding: '10px 12px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 13, fontFamily: 'Georgia, serif', outline: 'none', flex: '1 1 180px' }}
        />
        <button type="submit" disabled={busy} style={{ background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, padding: '10px 18px', fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontSize: 13 }}>
          {busy ? '…' : 'Notify me'}
        </button>
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 8 }}>{error}</div>}
    </form>
  )
}
