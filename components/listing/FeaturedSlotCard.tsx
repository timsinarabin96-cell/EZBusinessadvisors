'use client'

// =============================================================================
// FeaturedSlotCard — buy featured placement for a listing.
// Brokers pick 30/90-day or spotlight slots; payment goes through Stripe
// Checkout (demo fallback activates immediately when Stripe is unset).
// =============================================================================

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { FEATURED_SLOT_OPTIONS } from '@/lib/featuredSlots'
import { getAgencyContext } from '@/lib/agencyContext'

export default function FeaturedSlotCard({ listingId, businessName }: { listingId: string; businessName?: string | null }) {
  const toast = useToast()
  const [optionId, setOptionId] = useState<string>(FEATURED_SLOT_OPTIONS[0].id)
  const [busy, setBusy] = useState(false)

  const buy = async () => {
    setBusy(true)
    try {
      const ctx = await getAgencyContext()
      if (!ctx?.agencyId) {
        toast('You must be linked to an agency to feature a listing.', 'error')
        return
      }
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'featured', optionId, listingId, agencyId: ctx.agencyId }),
      })
      const j = await res.json()
      if (j.ok && j.url) {
        window.location.href = j.url
      } else {
        toast(j.error || 'Failed to start checkout', 'error')
      }
    } catch (e: any) {
      toast(e.message || 'Failed to start checkout', 'error')
    } finally {
      setBusy(false)
    }
  }

  const selected = FEATURED_SLOT_OPTIONS.find((o) => o.id === optionId)!

  return (
    <div style={{ background: 'linear-gradient(135deg,#1a1a2e 0%,#0f3460 100%)', color: '#fff', borderRadius: 14, padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>⭐</span>
        <span style={{ fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 16 }}>Feature this listing</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', marginBottom: 14 }}>
        {businessName || 'This listing'} — top of the public feed + homepage carousel.
      </div>

      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {FEATURED_SLOT_OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => setOptionId(o.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              padding: '11px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              border: optionId === o.id ? '2px solid #c9a84c' : '1px solid rgba(255,255,255,0.2)',
              background: optionId === o.id ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.05)',
              color: '#fff', fontSize: 13.5,
            }}
          >
            <span>
              <strong>{o.label}</strong>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>{o.description}</div>
            </span>
            <span style={{ fontWeight: 800, color: '#c9a84c', whiteSpace: 'nowrap' }}>${(o.priceCents / 100).toLocaleString()}</span>
          </button>
        ))}
      </div>

      <button onClick={buy} disabled={busy} style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#c9a84c', color: '#1a1a2e', border: 'none', fontWeight: 800, fontFamily: 'Georgia, serif', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Redirecting…' : `Feature for $${(selected.priceCents / 100).toLocaleString()}`}
      </button>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 10, textAlign: 'center' }}>
        Featured listings sort to the top of the public feed and homepage.
      </div>
    </div>
  )
}
