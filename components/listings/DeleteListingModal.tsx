/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { deleteListing } from '@/lib/listings'
import { useToast } from '@/components/ui/Toast'

// =============================================================================
// DeleteListingModal — every deletion requires a reason (broker sees it in the
// activity feed + the deletion log). Confirm stays disabled until a reason is
// picked; "Other" requires a note. Trash-with-restore: the listing is soft-
// deleted (status='deleted') so it can be pulled back from the Deleted tab.
// =============================================================================

const DELETE_REASONS = [
  { id: 'duplicate', label: 'Duplicate listing' },
  { id: 'sold_or_withdrawn', label: 'Sold / withdrawn' },
  { id: 'seller_cancelled', label: 'Seller cancelled' },
  { id: 'wrong_data', label: 'Wrong / incorrect data' },
  { id: 'test_listing', label: 'Test listing' },
  { id: 'other', label: 'Other' },
]

export default function DeleteListingModal({
  listingId,
  businessName,
  onClose,
  onDeleted,
}: {
  listingId: string
  businessName: string | null
  onClose: () => void
  onDeleted: () => void
}) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const confirmDisabled = !reason || (reason === 'other' && !note.trim()) || busy

  const confirm = async () => {
    if (confirmDisabled) return
    setBusy(true)
    try {
      await deleteListing(listingId, { reason, note: note.trim() || undefined })
      toast('Listing moved to trash', 'success')
      onDeleted()
    } catch (e: any) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.6)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => !busy && onClose()}>
      <div style={{ background: '#fff', borderRadius: 14, maxWidth: 460, width: '100%', boxShadow: '0 30px 80px rgba(26,26,46,0.4)', padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>🗑 Delete listing</div>
        <h2 style={{ margin: 0, fontSize: 20, color: 'var(--navy)' }}>{businessName || 'This listing'}</h2>
        <p style={{ margin: '8px 0 18px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.55 }}>
          The listing moves to <strong>trash</strong> and disappears from the marketplace. Your broker sees the reason below in the activity feed and deletion log — you can restore it anytime from the Deleted tab.
        </p>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
          Why are you deleting this listing? <span style={{ color: '#b91c1c' }}>*</span>
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="select"
          style={{ width: '100%', marginBottom: 14, fontSize: 14 }}
        >
          <option value="">Select a reason…</option>
          {DELETE_REASONS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
          Note {reason === 'other' && <span style={{ color: '#b91c1c' }}>(required for Other) *</span>}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={reason === 'other' ? 'Explain why this listing is being deleted…' : 'Optional context for your broker…'}
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', marginBottom: 18 }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-danger" onClick={confirm} disabled={confirmDisabled} style={{ opacity: confirmDisabled ? 0.5 : 1, cursor: confirmDisabled ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Deleting…' : '🗑 Delete listing'}
          </button>
        </div>
      </div>
    </div>
  )
}
