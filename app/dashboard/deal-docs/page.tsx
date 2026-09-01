/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { NdaPanel } from '@/components/dealdocs/NdaPanel'
import { NdaRequestsPanel } from '@/components/dealdocs/NdaRequestsPanel'
import { ListingAgreementsPanel } from '@/components/dealdocs/ListingAgreementsPanel'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Deal Docs — one hub for the confidentiality & engagement paperwork: NDA
// access requests, signed NDAs, and listing agreements. Previously three
// separate pages.
// =============================================================================

const TABS = [
  { key: 'nda', label: '🤝 NDAs', hint: 'Signed NDAs — approve, countersign, track' },
  { key: 'requests', label: '🛡️ NDA Requests', hint: 'Buyer access requests awaiting review' },
  { key: 'agreements', label: '📋 Listing Agreements', hint: 'Exclusive listing agreement sign-offs' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function DealDocsPage() {
  const [tab, setTab] = useState<TabKey>('nda')

  return (
    <AppShell active="Deal Docs">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="📄"
          eyebrow="Deal Docs"
          title="Deal Docs"
          sub="One hub for confidentiality & engagement paperwork — NDA access requests, signed NDAs, and listing agreements."
        />
        {/* Tab bar */}
        <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

        {tab === 'nda' && <NdaPanel />}
        {tab === 'requests' && <NdaRequestsPanel />}
        {tab === 'agreements' && <ListingAgreementsPanel />}
      </div>
    </AppShell>
  )
}
