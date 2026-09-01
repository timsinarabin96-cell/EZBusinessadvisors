/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import DealPipeline from '@/components/deals/DealPipeline'
import PipelineDashboard from '@/components/buyers/PipelineDashboard'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Deal Pipeline — one hub for deal movement: the kanban (Deal Pipeline) and
// the buyer funnel across deals (Pipeline). Previously two separate pages.
// =============================================================================

const TABS = [
  { key: 'kanban', label: '🔄 Deal Pipeline', hint: 'Kanban stages across every deal' },
  { key: 'funnel', label: '🎯 Buyer Funnel', hint: 'Buyers & conversion across deals' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function PipelinePage() {
  const [tab, setTab] = useState<TabKey>('kanban')

  return (
    <AppShell active="Deal Pipeline">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="🔄"
          eyebrow="Deals & Listings"
          title="Deal Pipeline"
          sub="Watch every deal move from first touch to close — kanban stages for deals, buyer funnel for conversion."
        />
        <PremiumTabs tabs={TABS} active={tab} onChange={setTab} />
        {tab === 'kanban' && <DealPipeline />}
        {tab === 'funnel' && <PipelineDashboard />}
      </div>
    </AppShell>
  )
}
