/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ProfessionalsPanel } from '@/components/network/ProfessionalsPanel'
import { ReferralsPanel } from '@/components/network/ReferralsPanel'
import { LeadMarketplacePanel } from '@/components/network/LeadMarketplacePanel'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Network — one hub for your professional ecosystem: the vetted professional
// directory (lawyers, CPAs, lenders), the referral program, and the lead
// marketplace. Previously three separate pages.
// =============================================================================

const TABS = [
  { key: 'professionals', label: '🤝 Professionals', hint: 'Lawyers, CPAs, lenders & consultants' },
  { key: 'referrals', label: '🎁 Referrals', hint: 'Referral program & rewards' },
  { key: 'marketplace', label: '💼 Lead Marketplace', hint: 'Buy & sell leads' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function NetworkPage() {
  const [tab, setTab] = useState<TabKey>('professionals')

  return (
    <AppShell active="Network">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="🤝"
          eyebrow="Network"
          title="Network"
          sub="Your professional ecosystem — the vetted directory, referral program, and lead marketplace."
        />
        {/* Tab bar */}
        <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

        {tab === 'professionals' && <ProfessionalsPanel />}
        {tab === 'referrals' && <ReferralsPanel />}
        {tab === 'marketplace' && <LeadMarketplacePanel />}
      </div>
    </AppShell>
  )
}
