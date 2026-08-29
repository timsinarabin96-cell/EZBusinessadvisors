/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// AICockpit — one surface for every AI tool. Tabs keep the sidebar clean
// while every tool stays one click away. Deep-linkable: ?tab=doctor
// =============================================================================

import { useState } from 'react'
import AutopilotDashboard from '@/components/autopilot/AutopilotDashboard'
import DealDoctorPanel from '@/components/ai/panels/DealDoctorPanel'
import DealTwinPanel from '@/components/ai/panels/DealTwinPanel'
import CallSummariesPanel from '@/components/ai/panels/CallSummariesPanel'
import DataRoomQaPanel from '@/components/ai/panels/DataRoomQaPanel'
import VisitorIntentPanel from '@/components/ai/panels/VisitorIntentPanel'
import RedFlagsPanel from '@/components/ai/panels/RedFlagsPanel'
import DealIntelligenceDashboard from '@/components/intelligence/DealIntelligenceDashboard'

interface Tab {
  key: string
  label: string
  icon: string
  hint: string
  Component: () => React.ReactNode
}

const TABS: Tab[] = [
  { key: 'autopilot', label: 'Autopilot', icon: '✨', hint: 'Workflow automations', Component: () => <AutopilotDashboard /> },
  { key: 'doctor', label: 'Deal Doctor', icon: '🩺', hint: 'Close-probability scores', Component: () => <DealDoctorPanel /> },
  { key: 'twin', label: 'Deal Twin', icon: '💠', hint: 'Live health score per listing', Component: () => <DealTwinPanel /> },
  { key: 'summaries', label: 'Call Summaries', icon: '🎧', hint: 'Transcripts → action items', Component: () => <CallSummariesPanel /> },
  { key: 'qa', label: 'Data Room Q&A', icon: '💬', hint: 'Ask anything about a room', Component: () => <DataRoomQaPanel /> },
  { key: 'intent', label: 'Visitor Intent', icon: '👀', hint: 'Anonymous buyer journeys', Component: () => <VisitorIntentPanel /> },
  { key: 'flags', label: 'Red Flags', icon: '🔎', hint: 'Financial forensics', Component: () => <RedFlagsPanel /> },
  { key: 'intelligence', label: 'Intelligence', icon: '◇', hint: 'Trust, evidence & engagement', Component: () => <DealIntelligenceDashboard /> },
]

function initialTab(): string {
  if (typeof window === 'undefined') return 'autopilot'
  const m = window.location.search.match(/[?&]tab=([a-z]+)/)
  const key = m ? m[1] : 'autopilot'
  return TABS.some((t) => t.key === key) ? key : 'autopilot'
}

export default function AICockpit() {
  const [tab, setTab] = useState<string>(initialTab)
  const active = TABS.find((t) => t.key === tab) || TABS[0]

  const select = (key: string) => {
    setTab(key)
    // Keep the URL in sync so the tab survives refresh / deep links work.
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', key)
      window.history.replaceState(null, '', url.toString())
    } catch { /* ignore */ }
  }

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24, padding: 6, background: '#f0f0f0', borderRadius: 12 }}>
        {TABS.map((t) => {
          const isActive = t.key === tab
          return (
            <button
              key={t.key}
              onClick={() => select(t.key)}
              title={t.hint}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 14px', borderRadius: 9, cursor: 'pointer',
                border: 'none', fontSize: 13.5, fontWeight: 700,
                fontFamily: 'Georgia, serif',
                background: isActive ? 'var(--navy)' : 'transparent',
                color: isActive ? '#fff' : 'var(--navy)',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 15 }}>{t.icon}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Active panel */}
      <div key={tab}>
        {active.Component()}
      </div>
    </div>
  )
}
