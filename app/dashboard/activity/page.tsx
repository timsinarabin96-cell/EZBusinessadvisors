/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ActivityPanel } from '@/components/overview/ActivityPanel'
import { NotificationsPanel } from '@/components/overview/NotificationsPanel'

// =============================================================================
// Activity & Alerts — one hub for staying on top of the business: the event
// log (Activity Feed) and notifications / digest controls (Notifications).
// Previously two separate pages.
// =============================================================================

const TABS = [
  { key: 'activity', label: '📋 Activity', hint: 'Event log & audit trail' },
  { key: 'alerts', label: '🛎️ Alerts', hint: 'Notifications & digests' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function ActivityPage() {
  const [tab, setTab] = useState<TabKey>('activity')

  return (
    <AppShell active="Activity & Alerts">
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

        {tab === 'activity' && <ActivityPanel />}
        {tab === 'alerts' && <NotificationsPanel />}
      </div>
    </AppShell>
  )
}
