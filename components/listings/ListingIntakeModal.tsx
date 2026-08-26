/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { authHeaders } from '@/lib/authToken'
import { useToast } from '@/components/ui/Toast'
import type { IntakeDraft } from '@/lib/listingIntakeCore'

// =============================================================================
// ListingIntakeModal — "✨ AI Intake": paste notes (call notes, email, voicemail
// transcript, P&L summary) and the AI extracts a structured listing draft that
// pre-fills the studio. The broker reviews, not types.
// =============================================================================

const EXAMPLE = `Seller called re: their home care agency near Harrisburg PA.
- Home Health Aide agency, established 2015
- Asking $520,000
- Revenue last 12mo: $410,000
- SDE $128,000, EBITDA about $104,000
- 12 full-time caregivers, 3 part-time
- Owner works 30 hrs/wk, wants to retire, will train 6 weeks
- 75% recurring private-pay clients, largest customer ~8% of revenue
- Seller financing possible, asset sale
- Lease $2,400/mo, 4,800 sq ft, expires 2027-06
- Reason: retirement after 30 years in healthcare`

export default function ListingIntakeModal({
  onApply,
  onClose,
}: {
  onApply: (draft: IntakeDraft) => void
  onClose: () => void
}) {
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    if (notes.trim().length < 20) {
      setError('Paste at least a few sentences of notes to extract from.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/listings/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ notes, mode: 'full' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || j.detail || 'AI intake failed')
      if (!j.draft || Object.keys(j.draft).length === 0) {
        throw new Error('AI found no extractable fields — try more detailed notes.')
      }
      onApply(j.draft as IntakeDraft)
      toast(`AI extracted ${j.coverage?.filled || Object.keys(j.draft).length} fields — review before saving`, 'success')
      onClose()
    } catch (e: any) {
      setError(e.message || 'AI intake failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.55)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, maxWidth: 620, width: '100%', boxShadow: '0 24px 70px rgba(26,26,46,0.4)', padding: 26 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--navy)' }}>✨ AI Intake</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
          Paste call notes, an email, a voicemail transcript, or a P&amp;L summary. The AI extracts the business record — you review and adjust. Nothing is saved until you confirm.
        </p>

        <textarea
          className="textarea"
          rows={9}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Paste notes here…"
          style={{ width: '100%' }}
        />

        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={() => setNotes(EXAMPLE)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
            Try an example
          </button>
        </div>

        {error && <div style={{ marginTop: 12, background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-navy" onClick={run} disabled={busy}>
            {busy ? 'Extracting…' : '⚡ Extract listing draft'}
          </button>
        </div>
      </div>
    </div>
  )
}
