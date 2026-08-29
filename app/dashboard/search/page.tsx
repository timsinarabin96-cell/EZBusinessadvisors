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
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 18px 60px' }}>
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

        {tab === 'search' && <SearchPanel />}
        {tab === 'alerts' && <DealAlertsPanel />}
      </div>
    </AppShell>
  )
}
