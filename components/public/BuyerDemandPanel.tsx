/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// BuyerDemandPanel — "X qualified buyers are waiting for businesses like
// yours" (the Flippa demand-signal play). Shows live, honest demand counts
// so sellers feel urgency to list. Public, rate-limited API, no identity leak.
// =============================================================================

import { useEffect, useState } from 'react'

interface DemandData {
  industryMatch: number
  locationMatch: number
  totalProfiles: number
  matched: number
  shown: number
  industry: string | null
  location: string | null
}

export default function BuyerDemandPanel({ industry, location, compact = false }: { industry?: string | null; location?: string | null; compact?: boolean }) {
  const [data, setData] = useState<DemandData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const params = new URLSearchParams()
    if (industry) params.set('industry', industry)
    if (location) params.set('location', location)
    fetch(`/api/marketplace/buyer-demand?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => { if (alive && j.ok) setData(j) })
      .catch(() => { if (alive) setData(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [industry, location])

  if (loading) {
    return <div style={{ height: compact ? 44 : 64, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 12.5 }}>Checking buyer demand…</div>
  }

  if (!data) return null

  const count = data.shown
  const detail =
    data.industry && data.location
      ? `${data.industryMatch} by industry · ${data.locationMatch} by location`
      : data.industry
        ? `${data.industryMatch} match your industry`
        : data.location
          ? `${data.locationMatch} match your location`
          : `${data.totalProfiles} active buyers on the platform`

  return (
    <div style={{
      borderRadius: 12,
      padding: compact ? '12px 16px' : '16px 18px',
      background: 'linear-gradient(135deg, rgba(30,126,52,0.16), rgba(16,42,67,0.10))',
      border: '1px solid rgba(30,126,52,0.35)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ fontSize: compact ? 22 : 28, flexShrink: 0 }}>🔥</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: compact ? 13.5 : 15, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
          {count > 0 ? `${count} qualified buyer${count === 1 ? ' is' : 's are'} actively looking for ${industry ? 'businesses like yours' : 'a business right now'}` : 'Buyers are watching the market right now'}
        </div>
        <div style={{ fontSize: compact ? 11.5 : 12.5, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{detail}</div>
      </div>
    </div>
  )
}
