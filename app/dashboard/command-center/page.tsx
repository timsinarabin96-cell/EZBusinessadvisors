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
import { PageHero } from '@/components/ui/premium'

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
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 18px 60px' }}>
          <PageHero
            icon="🎛️"
            eyebrow="Business Overview"
            title="Command Center"
            sub="Your deal operations at a glance — today's workflow, team performance, and pipeline analytics in one hub."
          />

          {/* Tab bar — premium segmented control */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8,
            background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(15,23,42,0.08)',
            borderRadius: 16, padding: 8, marginBottom: 22, backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 16px rgba(15,23,42,0.05)',
          }}>
            {TABS.map((t) => {
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    textAlign: 'left', padding: '12px 16px', borderRadius: 12, cursor: 'pointer', border: 'none',
                    background: active ? 'linear-gradient(135deg, #1a1a2e, #0f3460)' : 'transparent',
                    color: active ? '#fff' : 'var(--navy)',
                    boxShadow: active ? '0 6px 18px rgba(15,52,96,0.35)' : 'none',
                    transition: 'all 0.18s ease',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{t.label}</div>
                  <div style={{ fontSize: 12, opacity: active ? 0.7 : 0.55, marginTop: 2 }}>{t.hint}</div>
                </button>
              )
            })}
          </div>

          {tab === 'today' && <CommandCenterPanel />}
          {tab === 'performance' && <PerformancePanel />}
          {tab === 'analytics' && <AnalyticsDashboard />}
        </div>
      </ToastProvider>
    </AppShell>
  )
}
