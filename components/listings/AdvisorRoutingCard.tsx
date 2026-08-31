/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { useToast } from '@/components/ui/Toast'

// =============================================================================
// AdvisorRoutingCard (boss 08-31) — the free-tier decline is NOT a dead end.
// When a free-tier listing is declined from AI intake (interview route 403 with
// aiIntakeAllowed:false + advisorRouting:true), this card offers "work with a
// licensed advisor" and captures the seller's interest as a lead for the
// agency (POST /api/advisor/routing). Replaces a bare error with a real path.
// =============================================================================

export default function AdvisorRoutingCard({
  businessName,
  onClose,
  compact,
}: {
  businessName?: string | null
  onClose?: () => void
  compact?: boolean
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (busy) return
    if (!name.trim() || !email.trim()) {
      toast('Name and email are required', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await authenticatedFetch('/api/advisor/routing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() || null, businessName: businessName || null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Could not submit')
      setDone(true)
      toast('📨 Request sent — a licensed advisor will reach out', 'success')
    } catch (e: any) {
      toast(e.message || 'Could not submit', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: compact ? 12 : 16, fontSize: 13, color: '#14532d' }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>✅ Request received</div>
        A licensed advisor will reach out shortly. Your listing stays on the manual path in the meantime.
        {onClose && (
          <button type="button" onClick={onClose} style={{ display: 'block', marginTop: 10, background: 'none', border: 'none', color: '#166534', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}>
            Close
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: '#fdf6ec', border: '1px solid #f3d9a4', borderRadius: 10, padding: compact ? 12 : 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>
        🤝 Free listing? Work with a licensed advisor
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 10 }}>
        Free listings use manual entry. Want a licensed advisor to handle the AI intake, valuation, and listing prep for you? Leave your details — our team follows up.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={{ fontSize: 13 }} />
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" style={{ fontSize: 13 }} />
        <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" style={{ fontSize: 13 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button type="button" className="btn btn-navy" onClick={submit} disabled={busy} style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}>
            {busy ? 'Sending…' : '📨 Request an advisor'}
          </button>
          {onClose && (
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ fontSize: 13, padding: '8px 12px' }}>
              Not now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
