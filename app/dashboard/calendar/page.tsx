/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import CalendarDashboard from '@/components/calendar/CalendarDashboard'
import CallLog from '@/components/calls/CallLog'
import { RemindersPanel } from '@/components/calendar/RemindersPanel'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Calendar — one hub for time: appointments & deadlines (Calendar), phone
// activity (Call Log), and call-backs & reminders. Previously three separate
// pages.
// =============================================================================

const TABS = [
  { key: 'calendar', label: '📅 Calendar', hint: 'Appointments, tasks & deadlines' },
  { key: 'calls', label: '📞 Call Log', hint: 'Phone activity & call history' },
  { key: 'reminders', label: '⏰ Reminders', hint: 'Call-backs & follow-ups' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function CalendarPage() {
  const [tab, setTab] = useState<TabKey>('calendar')

  return (
    <AppShell active="Calendar">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="📅"
          eyebrow="Team & Office"
          title="Calendar"
          sub="Your time, in one place — appointments, call history, and follow-up reminders."
        />
        <PremiumTabs tabs={TABS} active={tab} onChange={setTab} />
        {tab === 'calendar' && <CalendarDashboard />}
        {tab === 'calls' && <CallLog />}
        {tab === 'reminders' && <RemindersPanel />}
      </div>
    </AppShell>
  )
}
