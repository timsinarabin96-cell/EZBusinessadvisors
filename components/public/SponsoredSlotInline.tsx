/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import type { AdSlot } from '@/types/ads'

// =============================================================================
// SponsoredSlotInline — client-side twin of SponsoredSlot for 'use client'
// pages (sell, brokers). Reads active slots through the public RLS policy
// (active + in-window only, no PII). Renders nothing when no slot exists.
// Impressions/clicks are tracked on server-rendered pages; here updates are
// skipped (RLS is read-only for anon), which is fine — the slot still earns.
// =============================================================================

export default function SponsoredSlotInline({ slotKey }: { slotKey: string }) {
  const [slot, setSlot] = useState<AdSlot | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('ad_slots')
        .select('*')
        .eq('slot_key', slotKey)
        .eq('active', true)
        .lte('starts_at', today)
        .or(`ends_at.is.null,ends_at.gte.${today}`)
        .maybeSingle()
      if (!cancelled) setSlot((data as AdSlot | null) || null)
    })()
    return () => { cancelled = true }
  }, [slotKey])

  if (!slot) return null

  return (
    <div style={{ maxWidth: 1180, margin: '18px auto 0', padding: '0 24px' }}>
      <a
        href={slot.url}
        target="_blank"
        rel="nofollow sponsored noopener"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
          background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10,
          padding: '10px 16px', transition: 'border-color .15s ease',
        }}
      >
        <span style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', border: '1px solid #d8d2c4', borderRadius: 999, padding: '2px 8px', flex: '0 0 auto' }}>
          {slot.badge || 'Sponsored'}
        </span>
        <span style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 700 }}>{slot.advertiser}</span>
        <span style={{ fontSize: 12.5, color: '#666', flex: 1 }}>{slot.body}</span>
        <span style={{ fontSize: 12, color: '#c9a84c', fontWeight: 800 }}>Learn more →</span>
      </a>
    </div>
  )
}
