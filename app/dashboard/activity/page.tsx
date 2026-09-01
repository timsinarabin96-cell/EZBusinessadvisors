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
import { PageHero, PremiumTabs } from '@/components/ui/premium'

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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="📋"
          eyebrow="Activity & Alerts"
          title="Activity & Alerts"
          sub="One hub for staying on top of the business — the event log (Activity Feed) and notifications / digest controls."
        />
        {/* Tab bar */}
        <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

        {tab === 'activity' && <ActivityPanel />}
        {tab === 'alerts' && <NotificationsPanel />}
      </div>
    </AppShell>
  )
}
