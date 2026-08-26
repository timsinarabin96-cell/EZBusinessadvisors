/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createServerClient } from '@/lib/supabase/server'
import type { AdSlot } from '@/types/ads'

// =============================================================================
// SponsoredSlot — small text-only "Sponsored" card for public pages.
// Renders nothing when no active slot exists for the placement key, so pages
// degrade gracefully. FTC-safe: always shows the badge label ("Sponsored").
// =============================================================================

export async function SponsoredSlot({ slotKey }: { slotKey: string }) {
  const db = createServerClient()
  if (!db) return null

  const today = new Date().toISOString().slice(0, 10)
  const { data } = await db
    .from('ad_slots')
    .select('*')
    .eq('slot_key', slotKey)
    .eq('active', true)
    .lte('starts_at', today)
    .or(`ends_at.is.null,ends_at.gte.${today}`)
    .maybeSingle()

  const slot = data as AdSlot | null
  if (!slot) return null

  // Fire-and-forget impression counter (never blocks render).
  void (async () => {
    try {
      await db.from('ad_slots').update({ impressions: (slot.impressions || 0) + 1 }).eq('id', slot.id)
    } catch { /* non-critical */ }
  })()

  return (
    <div style={{ maxWidth: 1180, margin: '18px auto 0', padding: '0 24px' }}>
      <a
        href={slot.url}
        target="_blank"
        rel="nofollow sponsored noopener"
        onClick={() => {
          void (async () => {
            try {
              await db.from('ad_slots').update({ clicks: (slot.clicks || 0) + 1 }).eq('id', slot.id)
            } catch { /* non-critical */ }
          })()
        }}
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
