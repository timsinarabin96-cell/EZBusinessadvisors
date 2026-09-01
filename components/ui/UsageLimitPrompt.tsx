/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import Link from 'next/link'
import { PCard } from '@/components/ui/premium'

// =============================================================================
// UsageLimitPrompt — shown when a create/invite action is blocked by a plan
// limit. Ties the dead-end to the REAL pricing tiers (pricing page for CRM
// subscriptions, billing for in-app upgrade).
// =============================================================================

export default function UsageLimitPrompt({
  reason,
  upgradeUrl = '/pricing',
  kind,
}: {
  reason: string
  upgradeUrl?: string
  kind?: 'listings' | 'agents' | 'leads' | 'deals' | 'storage'
}) {
  const icon =
    kind === 'listings' ? '🏢' : kind === 'agents' ? '👥' : kind === 'leads' ? '🎯' : kind === 'deals' ? '🤝' : '💾'
  return (
    <PCard hover style={{ border: '1px solid rgba(201,168,76,0.5)', background: 'linear-gradient(135deg,#fffdf5,#fdf6e4)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.06))',
          border: '1px solid rgba(201,168,76,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1a1a2e', fontFamily: 'var(--font-display)' }}>
            Plan limit reached
          </div>
          <div style={{ fontSize: 13.5, color: '#6b5b2a', lineHeight: 1.55, marginTop: 4 }}>{reason}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <Link href={upgradeUrl} className="btn btn-gold" style={{ textDecoration: 'none', padding: '10px 20px', fontSize: 13.5 }}>
              ⬆ Upgrade Plan
            </Link>
            <Link href="/contact" style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#1a1a2e', textDecoration: 'none', borderRadius: 10, border: '1px solid rgba(26,26,46,0.15)' }}>
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </PCard>
  )
}
