/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import ListingAdvisor from '@/components/listing/ListingAdvisorPanel'
import { SellerReadinessPanel } from '@/components/listing/SellerReadinessPanel'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Listing Advisor — one hub for seller-side prep: AI listability + valuation
// (Listing Advisor) and the readiness-to-close funnel (Seller Readiness).
// Previously two separate pages.
// =============================================================================

const TABS = [
  { key: 'advisor', label: '🩺 Listing Advisor', hint: 'Worth listing? What to ask, value, CIM readiness' },
  { key: 'readiness', label: '🚀 Seller Readiness', hint: 'Readiness-to-close funnel & blockers' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function ListingAdvisorPage() {
  const [tab, setTab] = useState<TabKey>('advisor')

  return (
    <AppShell active="Listing Advisor">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
          <PageHero
            icon="🩺"
            eyebrow="Listing Advisor"
            title="Listing Advisor"
            sub="One hub for seller-side prep — AI listability & valuation, plus the readiness-to-close funnel."
          />
          {/* Tab bar */}
          <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

          {tab === 'advisor' && <ListingAdvisor />}
          {tab === 'readiness' && <SellerReadinessPanel />}
        </div>
      </ToastProvider>
    </AppShell>
  )
}
