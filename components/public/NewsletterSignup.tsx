'use client'

import { useState } from 'react'

// Footer newsletter signup — captures email via /api/newsletter (stored in
// platform_settings + welcome email queued). No auth required.
export default function NewsletterSignup() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('error')
      return
    }
    setStatus('saving')
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, source: 'footer' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'Signup failed')
      setStatus('done')
      setEmail('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 280 }}>
      <div style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 700, marginBottom: 4 }}>
        Market Insights
      </div>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: 0 }}>
        Multiples, SBA updates, and selling tips — no spam, ever.
      </p>
      {status === 'done' ? (
        <div style={{ fontSize: 13, color: '#7ee0a3', fontWeight: 600 }}>✓ Subscribed — welcome aboard!</div>
      ) : (
        <>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setStatus('idle') }}
            placeholder="you@email.com"
            style={{
              padding: '9px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13, outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={status === 'saving'}
            style={{
              background: '#c9a84c', color: '#1a1a2e', border: 'none', borderRadius: 6,
              padding: '9px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {status === 'saving' ? 'Subscribing…' : 'Subscribe'}
          </button>
          {status === 'error' && <div style={{ fontSize: 12, color: '#fca5a5' }}>Enter a valid email and try again.</div>}
        </>
      )}
    </form>
  )
}
