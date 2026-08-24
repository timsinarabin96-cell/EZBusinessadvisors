'use client'

// =============================================================================
// PocketListingsClient — off-market teaser grid + confidential interest form.
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { ToastProvider, useToast } from '@/components/ui/Toast'

const fmt$ = (n: number | null | undefined) => (n == null ? null : '$' + n.toLocaleString('en-US'))

export default function PocketListingsClient({ teasers }: { teasers: any[] }) {
  const toast = useToast()
  const [selected, setSelected] = useState<any | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) {
      toast('Name and email are required', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/notify/buyer-interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: selected?.listing_id,
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          message: `Pocket listing interest${selected?.public_title ? ` — ${selected.public_title}` : ''}. ${form.message || ''}`,
        }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Failed')
      setDone(true)
      toast('Request sent — a broker will contact you confidentially.', 'success')
    } catch (err: any) {
      toast(err.message || 'Request failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 16 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🤝</div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e', margin: '0 0 8px' }}>Request received</h2>
        <p style={{ color: '#666', fontSize: 14.5 }}>A broker will reach out within one business day to discuss off-market opportunities confidentially.</p>
      </div>
    )
  }

  return (
    <ToastProvider>
      {teasers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 16, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🗄️</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>No pocket listings right now</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            Check back soon — or{' '}
            <Link href="/marketplace/professionals" style={{ color: '#c9a84c', fontWeight: 700 }}>talk to a broker</Link> about off-market access.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {teasers.map((t) => (
            <div key={t.listing_id} style={{ background: 'linear-gradient(160deg,#1a1a2e,#0f3460)', color: '#fff', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 26 }}>🤫</div>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: 'Georgia, serif' }}>{t.public_title || 'Confidential Opportunity'}</div>
              {t.industry && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{t.industry}</div>}
              {t.location_general && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>📍 {t.location_general}</div>}
              {t.asking_price != null && <div style={{ fontSize: 14, fontWeight: 800, color: '#c9a84c' }}>Price on application</div>}
              <button
                onClick={() => { setSelected(t); setDone(false) }}
                style={{ marginTop: 'auto', padding: '11px', borderRadius: 8, background: '#c9a84c', color: '#1a1a2e', border: 'none', fontWeight: 800, cursor: 'pointer', fontFamily: 'Georgia, serif' }}
              >
                Request Confidential Details
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && !done && (
        <div style={{ marginTop: 28, background: '#fff', border: '1px solid #ece8dc', borderRadius: 16, padding: 28, maxWidth: 560 }}>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '0 0 4px' }}>Interested in this pocket listing?</h3>
          <p style={{ fontSize: 13.5, color: '#888', margin: '0 0 16px' }}>
            {selected.public_title || 'This confidential opportunity'} — a broker will contact you. No obligation, fully confidential.
          </p>
          <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" style={inputStyle} />
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" style={inputStyle} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" style={inputStyle} />
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="What are you looking to acquire?" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            <button disabled={busy} type="submit" style={{ padding: '13px', borderRadius: 8, background: '#0e7490', color: '#fff', border: 'none', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
              {busy ? 'Sending…' : 'Send Request'}
            </button>
          </form>
        </div>
      )}
    </ToastProvider>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 14, fontFamily: 'Georgia, serif', outline: 'none', background: '#fff' }
