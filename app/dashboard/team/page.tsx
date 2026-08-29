/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { HiringPanel } from '@/components/admin/HiringPanel'
import OnboardingDashboard from '@/components/training/OnboardingDashboard'

// =============================================================================
// Team — one hub for growing the brokerage: hiring (offer letters &
// applications) and onboarding (new-agent checklist). Previously two pages.
// =============================================================================

const TABS = [
  { key: 'hiring', label: '🤝 Hiring', hint: 'Offer letters & applications' },
  { key: 'onboarding', label: '🚀 Onboarding', hint: 'New-agent checklist & setup' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function TeamPage() {
  const [tab, setTab] = useState<TabKey>('hiring')
  const [brokerId, setBrokerId] = useState<string | null>(null)

  useEffect(() => {
    setBrokerId(window.localStorage.getItem('concord_broker_id') || null)
  }, [])

  return (
    <AppShell active="Team">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 18px 60px' }}>
        {/* Tab bar */}
        <div className="flex flex-col md:flex-row gap-2 mb-4 bg-white rounded-xl border border-gray-200 p-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 text-left px-4 py-3 rounded-lg transition-colors"
              style={{
                background: tab === t.key ? '#1a1a2e' : 'transparent',
                color: tab === t.key ? '#fff' : 'var(--navy)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{t.hint}</div>
            </button>
          ))}
        </div>

        {tab === 'hiring' && <HiringPanel />}
        {tab === 'onboarding' &&
          (brokerId ? <OnboardingDashboard brokerId={brokerId} /> : <p style={{ color: 'var(--muted)' }}>Sign in to view your onboarding checklist.</p>)}
      </div>
    </AppShell>
  )
}
