/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// ListingUpsellPanel — "your listing is free, but here's what makes it sell"
// -----------------------------------------------------------------------------
// Shown in the seller portal + owner listing flow. Offers the paid boosts that
// turn a FREE owner listing into revenue: Featured placement, Verified Revenue
// badge (bank-vs-books), and Financial Intelligence. Every price comes from
// lib/pricing.ts — the single source of truth. Checkout goes through
// /api/stripe/checkout (featured | verified_revenue | financial_intelligence).
// =============================================================================

import { useState } from 'react'
import { LISTING_UPSELL_OPTIONS } from '@/lib/pricing'
import { useToast } from '@/components/ui/Toast'

export default function ListingUpsellPanel({
  listingId,
  agencyId,
  compact = false,
}: {
  listingId: string
  agencyId?: string | null
  compact?: boolean
}) {
  const toast = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)

  const buy = async (option: (typeof LISTING_UPSELL_OPTIONS)[number]) => {
    if (!agencyId && option.checkoutProduct !== 'financial_intelligence') {
      toast('Agency not linked yet — your broker will set this up.', 'error')
      return
    }
    setBusyId(option.id)
    try {
      const body: Record<string, unknown> = {
        product: option.checkoutProduct,
        agencyId: agencyId || '',
        email: undefined,
      }
      if (option.checkoutProduct === 'featured') {
        body.optionId = option.id
        body.listingId = listingId
      } else if (option.checkoutProduct === 'verified_revenue') {
        body.listingId = listingId
      }
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Checkout failed')
      if (j.url) window.location.href = j.url
      else toast('Done ✅', 'success')
    } catch (e: any) {
      toast(e.message || 'Checkout failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>💎</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>Boost your listing</div>
          <div style={{ fontSize: 12, color: '#888' }}>Your listing is free — these upgrades make it sell faster.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {LISTING_UPSELL_OPTIONS.map((option) => (
          <div key={option.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{option.icon}</span>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1a1a2e' }}>{option.name}</div>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.5, flex: 1 }}>{option.description}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
              {option.features.map((f) => <div key={f}>✓ {f}</div>)}
            </div>
            <button
              onClick={() => buy(option)}
              disabled={busyId === option.id}
              style={{ marginTop: 12, padding: '9px 0', borderRadius: 8, background: '#1a1a2e', color: '#c9a84c', border: 'none', fontWeight: 800, fontSize: 12.5, cursor: busyId === option.id ? 'wait' : 'pointer' }}
            >
              {busyId === option.id ? 'Opening…' : `${option.price === 0 ? 'Free' : '$' + option.price}${option.billing.startsWith('/') ? option.billing : ' ' + option.billing}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
