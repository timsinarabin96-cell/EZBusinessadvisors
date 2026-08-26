/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// ReferralPanel — "refer a professional" tracker for the CRM.
// Shows the user's shareable referral link + how many invites they sent and
// how many people self-onboarded through them. Word-of-mouth growth engine.
// =============================================================================

import { useEffect, useState } from 'react'

interface ReferralStats {
  ok: boolean
  sent: number
  filled: number
  pending: number
  referralUrl: string
  invites: { id: string; type: string; status: string; email: string | null; createdAt: string; filledAt: string | null }[]
}

export default function ReferralPanel() {
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/referrals/stats').then((r) => r.json()).then((j) => {
      if (j.ok) setStats(j)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ fontSize: 13, color: 'var(--muted)', padding: 8 }}>Loading referral stats…</div>
  if (!stats) return null

  const items = [
    { label: 'Invites sent', value: stats.sent },
    { label: 'Joined via you', value: stats.filled },
    { label: 'Pending', value: stats.pending },
  ]

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>🤝</span>
        <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 15 }}>Referral program</span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>— grow the network, track your invites</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 14 }}>
        {items.map((it) => (
          <div key={it.label} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>{it.value}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{it.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12.5, color: '#666', marginBottom: 6 }}>Your referral link (share anywhere):</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{ flex: 1, fontSize: 12, color: '#0e7490', wordBreak: 'break-all', background: '#f4f8fa', border: '1px solid #cfe6ef', borderRadius: 8, padding: '10px 12px' }}>
          {stats.referralUrl}
        </code>
        <button
          onClick={() => { navigator.clipboard?.writeText(stats.referralUrl) }}
          style={{ background: '#0e7490', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 12.5 }}
        >
          Copy
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#999' }}>
        When someone joins through your link and adds their profile, it counts as a referral. Invite attorneys, CPAs, lenders, and brokers you trust.
      </div>
    </div>
  )
}
