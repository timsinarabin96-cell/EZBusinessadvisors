/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { SearchPanel } from '@/components/search/SearchPanel'
import { DealAlertsPanel } from '@/components/search/DealAlertsPanel'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Search & Alerts — one hub for finding deals and staying notified: global
// search with saved searches (Search) and the deal-alerts watchlist
// (Deal Alerts). Previously two separate pages.
// =============================================================================

const TABS = [
  { key: 'search', label: '🔍 Search', hint: 'Find listings, leads, deals & docs' },
  { key: 'alerts', label: '🔔 Deal Alerts', hint: 'Watchlist, saved searches & email alerts' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function SearchPage() {
  const [tab, setTab] = useState<TabKey>('search')

  // Honor ?tab=alerts deep links (e.g. from search results).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && TABS.some((x) => x.key === t)) setTab(t as TabKey)
  }, [])

  return (
    <AppShell active="Search">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="🔍"
          eyebrow="Search & Alerts"
          title="Search & Alerts"
          sub="Find listings, leads, deals & docs with global search — and stay notified with your deal-alerts watchlist."
        />
        {/* Tab bar */}
        <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

        {tab === 'search' && <SearchPanel />}
        {tab === 'alerts' && <DealAlertsPanel />}
      </div>
    </AppShell>
  )
}
