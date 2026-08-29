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

        {tab === 'calendar' && <CalendarDashboard />}
        {tab === 'calls' && <CallLog />}
        {tab === 'reminders' && <RemindersPanel />}
      </div>
    </AppShell>
  )
}
