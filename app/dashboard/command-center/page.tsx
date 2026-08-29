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
import { CommandCenterPanel } from '@/components/overview/CommandCenterPanel'
import { PerformancePanel } from '@/components/overview/PerformancePanel'
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard'

// =============================================================================
// Command Center — one hub for the business overview: today's deal ops
// (Command Center), team performance (Performance), and pipeline/analytics
// charts (Analytics). Previously three separate pages.
// =============================================================================

const TABS = [
  { key: 'today', label: '🎛️ Today', hint: 'Deal workflow, SBA & status at a glance' },
  { key: 'performance', label: '🏆 Performance', hint: 'Agent leaderboard & commission KPIs' },
  { key: 'analytics', label: '📈 Analytics', hint: 'Pipeline, funnel, revenue charts' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function CommandCenterPage() {
  const [tab, setTab] = useState<TabKey>('today')

  return (
    <AppShell active="Command Center">
      <ToastProvider>
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

          {tab === 'today' && <CommandCenterPanel />}
          {tab === 'performance' && <PerformancePanel />}
          {tab === 'analytics' && <AnalyticsDashboard />}
        </div>
      </ToastProvider>
    </AppShell>
  )
}
