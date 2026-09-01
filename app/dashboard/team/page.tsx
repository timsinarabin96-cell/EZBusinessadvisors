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
import { PageHero, PremiumTabs } from '@/components/ui/premium'

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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="👥"
          eyebrow="Team"
          title="Team"
          sub="One hub for growing the brokerage — hiring (offer letters & applications) and onboarding (new-agent checklist)."
        />
        {/* Tab bar */}
        <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

        {tab === 'hiring' && <HiringPanel />}
        {tab === 'onboarding' &&
          (brokerId ? <OnboardingDashboard brokerId={brokerId} /> : <p style={{ color: 'var(--muted)' }}>Sign in to view your onboarding checklist.</p>)}
      </div>
    </AppShell>
  )
}
