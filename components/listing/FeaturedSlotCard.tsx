/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { FEATURED_SLOT_OPTIONS } from '@/lib/featuredSlots'
import { getAgencyContext } from '@/lib/agencyContext'
import { supabase } from '@/lib/supabase/client'

// =============================================================================
// FeaturedSlotCard — buy featured placement for a listing.
// Smart upgrades: if the listing already has an ACTIVE featured slot (e.g. 30
// days for $149), the card shows a "Featured until …" banner and ONLY the
// remaining upgrade options (90 days, Spotlight) — never re-offers the tier
// they already paid for. On the top tier already → "fully featured" state.
// =============================================================================

interface ActiveSlot {
  id: string
  amount_cents: number
  days: number
  starts_at: string
  ends_at: string
  status: string
}

/** Match an active slot row to its FEATURED_SLOT_OPTIONS id (price+days combo). */
function optionIdForSlot(slot: ActiveSlot): string | null {
  for (const o of FEATURED_SLOT_OPTIONS) {
    if (o.priceCents === slot.amount_cents && o.days === slot.days) return o.id
  }
  return null
}

export default function FeaturedSlotCard({ listingId, businessName }: { listingId: string; businessName?: string | null }) {
  const toast = useToast()
  const [optionId, setOptionId] = useState<string>(FEATURED_SLOT_OPTIONS[0].id)
  const [busy, setBusy] = useState(false)
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null)
  const [loadingSlot, setLoadingSlot] = useState(true)

  // Load the listing's ACTIVE featured slot so we only offer upgrades.
  const loadActive = useCallback(async () => {
    setLoadingSlot(true)
    try {
      const { data } = await supabase
        .from('featured_slots')
        .select('id, amount_cents, days, starts_at, ends_at, status')
        .eq('listing_id', listingId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setActiveSlot((data as ActiveSlot | null) || null)
    } catch {
      setActiveSlot(null)
    } finally {
      setLoadingSlot(false)
    }
  }, [listingId])

  useEffect(() => { loadActive() }, [loadActive])

  // If an active slot exists, hide the tier they already have (only upgrades).
  const currentOptionId = activeSlot ? optionIdForSlot(activeSlot) : null
  const availableOptions = FEATURED_SLOT_OPTIONS.filter((o) => o.id !== currentOptionId)
  const fullyFeatured = availableOptions.length === 0

  // Keep selection valid as options change.
  useEffect(() => {
    if (availableOptions.length > 0 && !availableOptions.some((o) => o.id === optionId)) {
      setOptionId(availableOptions[0].id)
    }
  }, [availableOptions, optionId])

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

  const selected = availableOptions.find((o) => o.id === optionId) || availableOptions[0]

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return iso
    }
  }

  return (
    <div style={{ background: 'linear-gradient(135deg,#1a1a2e 0%,#0f3460 100%)', color: '#fff', borderRadius: 14, padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>⭐</span>
        <span style={{ fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 16 }}>Feature this listing</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', marginBottom: 14 }}>
        {businessName || 'This listing'} — top of the public feed + homepage carousel.
      </div>

      {/* Active feature banner — they already paid for a tier */}
      {activeSlot && (
        <div style={{ marginBottom: 12, padding: '11px 13px', borderRadius: 9, background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.45)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#86efac' }}>✅ Featured until {fmtDate(activeSlot.ends_at)}</div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
            {fullyFeatured
              ? 'This listing is already on the highest featured tier.'
              : 'Upgrade to extend coverage or go bigger:'}
          </div>
        </div>
      )}

      {loadingSlot ? (
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', padding: '8px 0' }}>Checking current feature status…</div>
      ) : fullyFeatured ? (
        <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
          <div style={{ fontSize: 13, color: '#86efac', fontWeight: 700 }}>🎉 Fully featured</div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>
            Your listing is at the top of the marketplace until {fmtDate(activeSlot!.ends_at)}.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            {availableOptions.map((o) => (
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

          <button onClick={buy} disabled={busy || !selected} style={{ width: '100%', padding: '12px', borderRadius: 8, background: '#c9a84c', color: '#1a1a2e', border: 'none', fontWeight: 800, fontFamily: 'Georgia, serif', cursor: busy || !selected ? 'not-allowed' : 'pointer', opacity: busy || !selected ? 0.6 : 1 }}>
            {busy ? 'Redirecting…' : selected ? `Upgrade for $${(selected.priceCents / 100).toLocaleString()}` : 'No upgrade available'}
          </button>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 10, textAlign: 'center' }}>
            Featured listings sort to the top of the public feed and homepage.
          </div>
        </>
      )}
    </div>
  )
}
